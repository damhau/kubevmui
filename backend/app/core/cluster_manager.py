from dataclasses import dataclass

from kubernetes import client, config


@dataclass
class ClusterInfo:
    name: str
    api_client: client.ApiClient | None = None
    is_local: bool = False
    connected: bool = False


class ClusterManager:
    def __init__(self, kubeconfig_path: str | None = None, in_cluster: bool = True):
        self._clusters: dict[str, ClusterInfo] = {}
        self._setup_local_cluster(kubeconfig_path, in_cluster)

    def _setup_local_cluster(self, kubeconfig_path: str | None, in_cluster: bool):
        api_client = None
        connected = False
        try:
            if in_cluster:
                config.load_incluster_config()
                api_client = client.ApiClient()
                connected = True
            elif kubeconfig_path:
                api_client = config.new_client_from_config(config_file=kubeconfig_path)
                connected = True
        except Exception:
            pass
        self._clusters["local"] = ClusterInfo(
            name="local", api_client=api_client, is_local=True, connected=connected,
        )

    def list_clusters(self) -> list[ClusterInfo]:
        return list(self._clusters.values())

    def get_cluster(self, name: str) -> ClusterInfo | None:
        return self._clusters.get(name)

    def get_api_client(self, cluster_name: str) -> client.ApiClient | None:
        cluster = self._clusters.get(cluster_name)
        if cluster and cluster.api_client:
            return cluster.api_client
        return None
