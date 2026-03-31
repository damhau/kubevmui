from app.core.k8s_client import KubeVirtClient
from app.models.kubevirt_info import KubeVirtComponent, KubeVirtCondition, KubeVirtInfo

_COMPONENT_RESOURCES = {"deployments", "daemonsets"}


class KubeVirtInfoService:
    def __init__(self, kv: KubeVirtClient):
        self.kv = kv

    def get_info(self) -> KubeVirtInfo | None:
        items = self.kv.list_kubevirts()
        if not items:
            return None
        raw = items[0]
        return _info_from_raw(raw)


def _info_from_raw(raw: dict) -> KubeVirtInfo:
    metadata = raw.get("metadata", {})
    spec = raw.get("spec", {})
    status = raw.get("status", {})

    # Feature gates
    feature_gates = (
        spec.get("configuration", {}).get("developerConfiguration", {}).get("featureGates", [])
    )

    # Conditions
    conditions = [
        KubeVirtCondition(
            type=c.get("type", ""),
            status=c.get("status", ""),
            reason=c.get("reason", ""),
            message=c.get("message", ""),
            last_transition_time=c.get("lastTransitionTime"),
        )
        for c in status.get("conditions", [])
    ]

    # Components (filter to deployments/daemonsets only)
    components = [
        KubeVirtComponent(
            name=g.get("name", ""),
            resource=g.get("resource", ""),
            namespace=g.get("namespace"),
        )
        for g in status.get("generations", [])
        if g.get("resource") in _COMPONENT_RESOURCES
    ]

    infra = spec.get("infra")
    infra_replicas = infra.get("replicas") if infra else None

    created_at = metadata.get("creationTimestamp")

    return KubeVirtInfo(
        phase=status.get("phase", "Unknown"),
        operator_version=status.get("operatorVersion", ""),
        observed_version=status.get("observedKubeVirtVersion", ""),
        target_version=status.get("targetKubeVirtVersion", ""),
        registry=status.get("observedKubeVirtRegistry", ""),
        default_architecture=status.get("defaultArchitecture", ""),
        outdated_workloads=status.get("outdatedVirtualMachineInstanceWorkloads", 0),
        feature_gates=feature_gates,
        conditions=conditions,
        components=components,
        infra_replicas=infra_replicas,
        created_at=created_at,
    )
