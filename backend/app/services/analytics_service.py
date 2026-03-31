from datetime import UTC, datetime

from kubernetes import client

from app.services.metrics_service import MetricsService


class AnalyticsService:
    """Provides analytics queries: top consumers, trends, migration frequency."""

    def __init__(self, api_client: client.ApiClient):
        self.api_client = api_client
        self.metrics = MetricsService(api_client)
        self.custom_api = client.CustomObjectsApi(api_client)

    def get_top_consumers(
        self,
        metric: str = "cpu",
        limit: int = 10,
        start: str = "",
        end: str = "",
        step: str = "300s",
    ) -> list[dict]:
        """Get top N VMs by resource consumption."""
        if metric == "cpu":
            query = f'topk({limit}, sum by (pod) (rate(container_cpu_usage_seconds_total{{pod=~"virt-launcher-.*",container="compute"}}[5m])))'
        elif metric == "memory":
            query = f'topk({limit}, sum by (pod) (container_memory_working_set_bytes{{pod=~"virt-launcher-.*",container="compute"}}))'
        elif metric == "network":
            query = (
                f"topk({limit}, sum by (pod) ("
                f'rate(container_network_receive_bytes_total{{pod=~"virt-launcher-.*"}}[5m])'
                f' + rate(container_network_transmit_bytes_total{{pod=~"virt-launcher-.*"}}[5m])))'
            )
        else:
            return []

        results = self.metrics.query(query)
        consumers = []
        for r in results:
            pod_name = r.get("metric", {}).get("pod", "")
            # Extract VM name from pod: virt-launcher-<vm-name>-<hash>
            parts = pod_name.replace("virt-launcher-", "").rsplit("-", 1)
            vm_name = parts[0] if parts else pod_name
            value = float(r.get("value", [0, 0])[1])
            consumers.append(
                {
                    "vm_name": vm_name,
                    "pod_name": pod_name,
                    "value": value,
                    "metric": metric,
                }
            )
        return consumers

    def get_trends(self, start: str, end: str, step: str = "600s") -> dict:
        """Get cluster-level trends."""
        vm_count_q = (
            'count(container_cpu_usage_seconds_total{pod=~"virt-launcher-.*",container="compute"})'
        )
        total_cpu_q = 'sum(rate(container_cpu_usage_seconds_total{pod=~"virt-launcher-.*",container="compute"}[5m]))'
        total_mem_q = (
            'sum(container_memory_working_set_bytes{pod=~"virt-launcher-.*",container="compute"})'
        )

        def extract(result):
            if not result:
                return []
            values = result[0].get("values", [])
            return [{"timestamp": v[0], "value": float(v[1])} for v in values]

        return {
            "vm_count": extract(self.metrics.query_range(vm_count_q, start, end, step)),
            "total_cpu": extract(self.metrics.query_range(total_cpu_q, start, end, step)),
            "total_memory": extract(self.metrics.query_range(total_mem_q, start, end, step)),
        }

    def get_migration_stats(self, range_days: int = 7) -> dict:
        """Get migration frequency from VirtualMachineInstanceMigration objects."""
        migrations = []
        try:
            result = self.custom_api.list_cluster_custom_object(
                group="kubevirt.io",
                version="v1",
                plural="virtualmachineinstancemigrations",
            )
            now = datetime.now(tz=UTC)
            for item in result.get("items", []):
                ts_str = item.get("metadata", {}).get("creationTimestamp", "")
                if not ts_str:
                    continue
                try:
                    ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
                except ValueError:
                    continue
                if (now - ts).days <= range_days:
                    phase = item.get("status", {}).get("phase", "Unknown")
                    migrations.append(
                        {
                            "timestamp": ts.isoformat(),
                            "vm_name": item.get("spec", {}).get("vmiName", ""),
                            "phase": phase,
                            "namespace": item.get("metadata", {}).get("namespace", ""),
                        }
                    )
        except Exception:
            pass

        return {
            "total": len(migrations),
            "succeeded": len([m for m in migrations if m["phase"] == "Succeeded"]),
            "failed": len([m for m in migrations if m["phase"] == "Failed"]),
            "migrations": sorted(migrations, key=lambda m: m["timestamp"], reverse=True),
        }
