import json
import urllib.parse

from kubernetes import client

from app.core.config import settings


class MetricsService:
    """Queries Prometheus via the K8s API server service proxy.

    Uses: /api/v1/namespaces/{ns}/services/{svc}:{port}/proxy/...
    This works from outside the cluster using the same kubeconfig auth.
    """

    def __init__(self, api_client: client.ApiClient):
        self.api_client = api_client
        # Parse prometheus_url to extract namespace, service name, and port
        # Format: http://service-name.namespace:port
        self._parse_prometheus_url()

    def _parse_prometheus_url(self):
        url = settings.prometheus_url
        # Strip protocol
        url = url.replace("http://", "").replace("https://", "")
        # Split host:port
        if ":" in url:
            host, port = url.rsplit(":", 1)
            self.prom_port = port
        else:
            host = url
            self.prom_port = "9090"
        # Split service.namespace
        if "." in host:
            self.prom_service = host.split(".")[0]
            self.prom_namespace = host.split(".")[1]
        else:
            self.prom_service = host
            self.prom_namespace = "monitoring"

    def _proxy_path(self, api_path: str) -> str:
        return (
            f"/api/v1/namespaces/{self.prom_namespace}"
            f"/services/{self.prom_service}:{self.prom_port}/proxy{api_path}"
        )

    def _call(self, api_path: str, params: dict) -> dict:
        """Make a GET request to Prometheus via K8s API proxy."""
        query_string = urllib.parse.urlencode(params)
        path = self._proxy_path(api_path)
        if query_string:
            path = f"{path}?{query_string}"

        response = self.api_client.call_api(
            path,
            "GET",
            response_type="object",
            _return_http_data_only=True,
        )
        # response is already parsed as dict by the K8s client
        if isinstance(response, dict):
            return response
        # Fallback: try to parse as JSON string
        if isinstance(response, str):
            return json.loads(response)
        return {}

    def query(self, promql: str) -> list[dict]:
        """Execute an instant Prometheus query."""
        data = self._call("/api/v1/query", {"query": promql})
        if data.get("status") != "success":
            return []
        return data.get("data", {}).get("result", [])

    def query_range(self, promql: str, start: str, end: str, step: str = "60s") -> list[dict]:
        """Execute a range Prometheus query."""
        data = self._call(
            "/api/v1/query_range",
            {
                "query": promql,
                "start": start,
                "end": end,
                "step": step,
            },
        )
        if data.get("status") != "success":
            return []
        return data.get("data", {}).get("result", [])

    def get_vm_metrics(
        self, namespace: str, vm_name: str, start: str, end: str, step: str = "60s"
    ) -> dict:
        """Get CPU, memory, network metrics for a specific VM."""
        pod_selector = f'pod=~"virt-launcher-{vm_name}-.*",namespace="{namespace}"'

        cpu_query = (
            f'rate(container_cpu_usage_seconds_total{{{pod_selector},container="compute"}}[5m])'
        )
        memory_query = f'container_memory_working_set_bytes{{{pod_selector},container="compute"}}'
        net_rx_query = f"rate(container_network_receive_bytes_total{{{pod_selector}}}[5m])"
        net_tx_query = f"rate(container_network_transmit_bytes_total{{{pod_selector}}}[5m])"

        # Storage: usage percentage per PVC attached to this VM's virt-launcher pod
        # We find PVCs by matching the pod name pattern
        storage_used_query = (
            f'kubelet_volume_stats_used_bytes{{namespace="{namespace}"}}'
            f' / kubelet_volume_stats_capacity_bytes{{namespace="{namespace}"}}'
        )

        # Disk I/O
        disk_read_query = (
            f'rate(container_fs_reads_bytes_total{{{pod_selector},container="compute"}}[5m])'
        )
        disk_write_query = (
            f'rate(container_fs_writes_bytes_total{{{pod_selector},container="compute"}}[5m])'
        )

        cpu_data = self.query_range(cpu_query, start, end, step)
        memory_data = self.query_range(memory_query, start, end, step)
        net_rx_data = self.query_range(net_rx_query, start, end, step)
        net_tx_data = self.query_range(net_tx_query, start, end, step)
        storage_data = self.query_range(storage_used_query, start, end, step)
        disk_read_data = self.query_range(disk_read_query, start, end, step)
        disk_write_data = self.query_range(disk_write_query, start, end, step)

        def extract_values(result: list[dict]) -> list[dict]:
            if not result:
                return []
            values = result[0].get("values", [])
            return [{"timestamp": v[0], "value": float(v[1])} for v in values]

        # Filter storage results to PVCs belonging to this VM
        storage_by_pvc: dict[str, list[dict]] = {}
        for series in storage_data:
            pvc_name = series.get("metric", {}).get("persistentvolumeclaim", "")
            if pvc_name.startswith(f"{vm_name}-"):
                values = [
                    {"timestamp": v[0], "value": float(v[1])} for v in series.get("values", [])
                ]
                storage_by_pvc[pvc_name] = values

        return {
            "cpu": extract_values(cpu_data),
            "memory": extract_values(memory_data),
            "network_rx": extract_values(net_rx_data),
            "network_tx": extract_values(net_tx_data),
            "storage": storage_by_pvc,
            "disk_read": extract_values(disk_read_data),
            "disk_write": extract_values(disk_write_data),
        }

    def get_vm_timeline(
        self, namespace: str, vm_name: str, start: str, end: str, step: str = "60s"
    ) -> dict:
        """Get combined metrics and events for VM timeline view."""
        metrics = self.get_vm_metrics(namespace, vm_name, start, end, step)
        return {
            "cpu": metrics.get("cpu", []),
            "memory": metrics.get("memory", []),
        }

    def get_node_metrics(self, node_name: str, start: str, end: str, step: str = "60s") -> dict:
        """Get CPU and memory metrics for a specific node.

        Uses node_uname_info to map nodename to instance, then queries node_exporter metrics.
        """
        # Join via node_uname_info to resolve nodename → instance
        cpu_query = (
            f'1 - avg(rate(node_cpu_seconds_total{{mode="idle"}}[5m]) '
            f'* on(instance) group_left(nodename) node_uname_info{{nodename="{node_name}"}})'
        )
        memory_query = (
            f"1 - ((node_memory_MemAvailable_bytes "
            f'* on(instance) group_left(nodename) node_uname_info{{nodename="{node_name}"}}) '
            f"/ (node_memory_MemTotal_bytes "
            f'* on(instance) group_left(nodename) node_uname_info{{nodename="{node_name}"}}))'
        )

        cpu_data = self.query_range(cpu_query, start, end, step)
        memory_data = self.query_range(memory_query, start, end, step)

        def extract_values(result: list[dict]) -> list[dict]:
            if not result:
                return []
            values = result[0].get("values", [])
            return [{"timestamp": v[0], "value": float(v[1])} for v in values]

        return {
            "cpu_usage_pct": extract_values(cpu_data),
            "memory_usage_pct": extract_values(memory_data),
        }

    def get_cluster_metrics(self, start: str, end: str, step: str = "300s") -> dict:
        """Get cluster-level metrics."""

        def extract_values(result: list[dict]) -> list[dict]:
            if not result:
                return []
            values = result[0].get("values", [])
            return [{"timestamp": v[0], "value": float(v[1])} for v in values]

        # VM count
        vm_count_q = 'count(kubevirt_vmi_cpu_usage_seconds_total) or count(container_cpu_usage_seconds_total{pod=~"virt-launcher-.*",container="compute"})'
        # Total VM CPU usage (prefer KubeVirt-native, fallback to container)
        total_cpu_q = 'sum(rate(kubevirt_vmi_cpu_usage_seconds_total[5m])) or sum(rate(container_cpu_usage_seconds_total{pod=~"virt-launcher-.*",container="compute"}[5m]))'
        # Total VM memory usage (prefer KubeVirt-native, fallback to container)
        total_memory_q = 'sum(kubevirt_vmi_memory_resident_bytes) or sum(container_memory_working_set_bytes{pod=~"virt-launcher-.*",container="compute"})'
        # Total network
        total_net_rx_q = (
            'sum(rate(container_network_receive_bytes_total{pod=~"virt-launcher-.*"}[5m]))'
        )
        total_net_tx_q = (
            'sum(rate(container_network_transmit_bytes_total{pod=~"virt-launcher-.*"}[5m]))'
        )
        # Average node CPU
        node_cpu_q = '1 - avg(rate(node_cpu_seconds_total{mode="idle"}[5m]))'
        # Average node memory
        node_memory_q = "1 - avg(node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)"
        # Average storage utilization
        storage_q = "avg(kubelet_volume_stats_used_bytes / kubelet_volume_stats_capacity_bytes)"

        return {
            "vm_count": extract_values(self.query_range(vm_count_q, start, end, step)),
            "total_cpu": extract_values(self.query_range(total_cpu_q, start, end, step)),
            "total_memory": extract_values(self.query_range(total_memory_q, start, end, step)),
            "total_network_rx": extract_values(self.query_range(total_net_rx_q, start, end, step)),
            "total_network_tx": extract_values(self.query_range(total_net_tx_q, start, end, step)),
            "node_cpu_avg": extract_values(self.query_range(node_cpu_q, start, end, step)),
            "node_memory_avg": extract_values(self.query_range(node_memory_q, start, end, step)),
            "storage_usage_avg": extract_values(self.query_range(storage_q, start, end, step)),
        }
