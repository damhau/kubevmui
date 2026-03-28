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
            path, "GET",
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
        data = self._call("/api/v1/query_range", {
            "query": promql, "start": start, "end": end, "step": step,
        })
        if data.get("status") != "success":
            return []
        return data.get("data", {}).get("result", [])

    def get_vm_metrics(self, namespace: str, vm_name: str, start: str, end: str, step: str = "60s") -> dict:
        """Get CPU, memory, network metrics for a specific VM."""
        pod_selector = f'pod=~"virt-launcher-{vm_name}-.*",namespace="{namespace}"'

        cpu_query = f'rate(container_cpu_usage_seconds_total{{{pod_selector},container="compute"}}[5m])'
        memory_query = f'container_memory_working_set_bytes{{{pod_selector},container="compute"}}'
        net_rx_query = f'rate(container_network_receive_bytes_total{{{pod_selector}}}[5m])'
        net_tx_query = f'rate(container_network_transmit_bytes_total{{{pod_selector}}}[5m])'

        cpu_data = self.query_range(cpu_query, start, end, step)
        memory_data = self.query_range(memory_query, start, end, step)
        net_rx_data = self.query_range(net_rx_query, start, end, step)
        net_tx_data = self.query_range(net_tx_query, start, end, step)

        def extract_values(result: list[dict]) -> list[dict]:
            if not result:
                return []
            values = result[0].get("values", [])
            return [{"timestamp": v[0], "value": float(v[1])} for v in values]

        return {
            "cpu": extract_values(cpu_data),
            "memory": extract_values(memory_data),
            "network_rx": extract_values(net_rx_data),
            "network_tx": extract_values(net_tx_data),
        }

    def get_cluster_metrics(self, start: str, end: str, step: str = "300s") -> dict:
        """Get cluster-level VM metrics."""
        pod_count_query = 'count(container_cpu_usage_seconds_total{pod=~"virt-launcher-.*",container="compute"})'
        vm_count = self.query_range(pod_count_query, start, end, step)

        return {
            "vm_count": [
                {"timestamp": v[0], "value": float(v[1])}
                for v in (vm_count[0].get("values", []) if vm_count else [])
            ],
        }
