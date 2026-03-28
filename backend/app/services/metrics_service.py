import httpx

from app.core.config import settings


class MetricsService:
    def __init__(self):
        self.base_url = settings.prometheus_url

    async def query(self, promql: str) -> list[dict]:
        """Execute an instant Prometheus query."""
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{self.base_url}/api/v1/query",
                params={"query": promql},
            )
            resp.raise_for_status()
            data = resp.json()
            if data.get("status") != "success":
                return []
            return data.get("data", {}).get("result", [])

    async def query_range(self, promql: str, start: str, end: str, step: str = "60s") -> list[dict]:
        """Execute a range Prometheus query."""
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{self.base_url}/api/v1/query_range",
                params={"query": promql, "start": start, "end": end, "step": step},
            )
            resp.raise_for_status()
            data = resp.json()
            if data.get("status") != "success":
                return []
            return data.get("data", {}).get("result", [])

    async def get_vm_metrics(self, namespace: str, vm_name: str, start: str, end: str, step: str = "60s") -> dict:
        """Get CPU, memory, network metrics for a specific VM."""
        pod_selector = f'pod=~"virt-launcher-{vm_name}-.*",namespace="{namespace}"'

        cpu_query = f'rate(container_cpu_usage_seconds_total{{{pod_selector},container="compute"}}[5m])'
        memory_query = f'container_memory_working_set_bytes{{{pod_selector},container="compute"}}'
        net_rx_query = f'rate(container_network_receive_bytes_total{{{pod_selector}}}[5m])'
        net_tx_query = f'rate(container_network_transmit_bytes_total{{{pod_selector}}}[5m])'

        cpu_data = await self.query_range(cpu_query, start, end, step)
        memory_data = await self.query_range(memory_query, start, end, step)
        net_rx_data = await self.query_range(net_rx_query, start, end, step)
        net_tx_data = await self.query_range(net_tx_query, start, end, step)

        def extract_values(result: list[dict]) -> list[dict]:
            if not result:
                return []
            # Take first result series
            values = result[0].get("values", [])
            return [{"timestamp": v[0], "value": float(v[1])} for v in values]

        return {
            "cpu": extract_values(cpu_data),
            "memory": extract_values(memory_data),
            "network_rx": extract_values(net_rx_data),
            "network_tx": extract_values(net_tx_data),
        }

    async def get_cluster_metrics(self, start: str, end: str, step: str = "300s") -> dict:
        """Get cluster-level VM metrics."""
        # Count virt-launcher pods as proxy for running VMs
        pod_count_query = 'count(container_cpu_usage_seconds_total{pod=~"virt-launcher-.*",container="compute"})'

        vm_count = await self.query_range(pod_count_query, start, end, step)

        return {
            "vm_count": [
                {"timestamp": v[0], "value": float(v[1])}
                for v in (vm_count[0].get("values", []) if vm_count else [])
            ],
        }
