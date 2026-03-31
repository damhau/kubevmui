from pydantic import BaseModel


class KubeVirtCondition(BaseModel):
    type: str
    status: str
    reason: str = ""
    message: str = ""
    last_transition_time: str | None = None


class KubeVirtComponent(BaseModel):
    name: str
    resource: str
    namespace: str | None = None


class FeatureGateInfo(BaseModel):
    name: str
    description: str = ""
    maturity: str = ""  # Alpha, Beta, GA, Deprecated, Discontinued
    enabled: bool = False


class KubeVirtInfo(BaseModel):
    phase: str
    operator_version: str
    observed_version: str
    target_version: str
    registry: str
    default_architecture: str
    outdated_workloads: int
    feature_gates: list[str]
    disabled_feature_gates: list[str]
    all_feature_gates: list[FeatureGateInfo]
    conditions: list[KubeVirtCondition]
    components: list[KubeVirtComponent]
    infra_replicas: int | None = None
    created_at: str | None = None
