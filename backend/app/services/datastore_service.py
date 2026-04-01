from kubernetes import client
from kubernetes.client import ApiException

from app.models.datastore import Datastore
from app.services.storage_service import _parse_size

DEFAULT_SC_ANNOTATION = "storageclass.kubernetes.io/is-default-class"


def _detect_provider_type(provisioner: str) -> str:
    p = provisioner.lower()
    if "topolvm" in p:
        return "topolvm"
    if "rook" in p and "ceph" in p:
        return "ceph-rbd"
    if "cephfs" in p:
        return "cephfs"
    if "nfs" in p:
        return "nfs"
    if "local" in p:
        return "local-path"
    if "ebs.csi.aws" in p:
        return "aws-ebs"
    if "pd.csi.storage.gke" in p:
        return "gcp-pd"
    if "disk.csi.azure" in p:
        return "azure-disk"
    if "longhorn" in p:
        return "longhorn"
    if ".csi." in p:
        return "csi"
    return "unknown"


def _sc_to_datastore(sc, api_client: client.ApiClient) -> Datastore:
    meta = sc.metadata
    annotations = meta.annotations or {}
    is_default = annotations.get(DEFAULT_SC_ANNOTATION, "false").lower() == "true"
    parameters = dict(sc.parameters) if sc.parameters else {}

    serialized = api_client.sanitize_for_serialization(sc)

    return Datastore(
        name=meta.name,
        provisioner=sc.provisioner or "",
        is_default=is_default,
        reclaim_policy=sc.reclaim_policy or "Delete",
        volume_binding_mode=sc.volume_binding_mode or "WaitForFirstConsumer",
        allow_expansion=bool(sc.allow_volume_expansion),
        parameters=parameters,
        provider_type=_detect_provider_type(sc.provisioner or ""),
        raw_manifest=serialized,
    )


class DatastoreService:
    def __init__(self, api_client: client.ApiClient):
        self.api_client = api_client
        self.core_api = client.CoreV1Api(api_client)
        self.storage_api = client.StorageV1Api(api_client)
        self.custom_api = client.CustomObjectsApi(api_client)

    def _get_pv_stats_for_class(self, sc_name: str) -> tuple[int, int]:
        try:
            pvs = self.core_api.list_persistent_volume()
            count = 0
            total_gb = 0
            for pv in pvs.items:
                if pv.spec.storage_class_name == sc_name:
                    count += 1
                    cap = pv.spec.capacity or {}
                    total_gb += _parse_size(cap.get("storage", "0"))
            return count, total_gb
        except Exception:
            return 0, 0

    def _get_csi_capacity(self, sc_name: str) -> int | None:
        try:
            caps = self.storage_api.list_storage_capacity_for_all_namespaces()
            total = 0
            found = False
            for cap in caps.items:
                if cap.storage_class_name == sc_name and cap.capacity:
                    found = True
                    total += _parse_size(cap.capacity)
            return total if found else None
        except Exception:
            return None

    def _get_topolvm_details(self, parameters: dict) -> dict:
        details: dict = {}
        device_class = parameters.get("topolvm.io/device-class", "")
        if device_class:
            details["device_class"] = device_class

        # Query TopoLVM LogicalVolumes
        try:
            lvs = self.custom_api.list_cluster_custom_object(
                group="topolvm.io",
                version="v1",
                plural="logicalvolumes",
            )
            lv_items = lvs.get("items", [])
            if device_class:
                lv_items = [
                    lv
                    for lv in lv_items
                    if lv.get("spec", {}).get("deviceClass", "") == device_class
                ]
            details["lv_count"] = len(lv_items)
        except Exception:
            pass

        # Per-node capacity from CSIStorageCapacity
        try:
            caps = self.storage_api.list_storage_capacity_for_all_namespaces()
            nodes = []
            for cap in caps.items:
                if "topolvm" not in (cap.storage_class_name or "").lower():
                    continue
                node_name = ""
                if cap.node_topology and cap.node_topology.match_labels:
                    node_name = cap.node_topology.match_labels.get("topology.topolvm.io/node", "")
                if cap.capacity:
                    nodes.append(
                        {"name": node_name or "unknown", "available_gb": _parse_size(cap.capacity)}
                    )
            if nodes:
                details["nodes"] = nodes
        except Exception:
            pass

        return details

    def _enrich_datastore(self, ds: Datastore) -> Datastore:
        pv_count, total_gb = self._get_pv_stats_for_class(ds.name)
        ds.pv_count = pv_count
        ds.total_capacity_gb = total_gb
        ds.available_capacity_gb = self._get_csi_capacity(ds.name)

        if ds.provider_type == "topolvm":
            ds.provider_details = self._get_topolvm_details(ds.parameters)

        return ds

    def list_datastores(self) -> list[Datastore]:
        sc_list = self.storage_api.list_storage_class()
        datastores = []
        for sc in sc_list.items:
            ds = _sc_to_datastore(sc, self.api_client)
            ds = self._enrich_datastore(ds)
            datastores.append(ds)
        return datastores

    def get_datastore(self, name: str) -> Datastore | None:
        try:
            sc = self.storage_api.read_storage_class(name)
        except ApiException as e:
            if e.status == 404:
                return None
            raise
        ds = _sc_to_datastore(sc, self.api_client)
        return self._enrich_datastore(ds)
