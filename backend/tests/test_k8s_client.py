from app.core.cluster_manager import ClusterManager


def test_local_cluster_always_present():
    cm = ClusterManager(kubeconfig_path=None, in_cluster=False)
    clusters = cm.list_clusters()
    assert len(clusters) == 1
    assert clusters[0].name == "local"


def test_get_local_cluster():
    cm = ClusterManager(kubeconfig_path=None, in_cluster=False)
    cluster = cm.get_cluster("local")
    assert cluster is not None
    assert cluster.name == "local"


def test_get_nonexistent_cluster():
    cm = ClusterManager(kubeconfig_path=None, in_cluster=False)
    cluster = cm.get_cluster("nonexistent")
    assert cluster is None
