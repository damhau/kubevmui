import logging
import re

import httpx

from app.core.k8s_client import KubeVirtClient
from app.models.kubevirt_info import (
    FeatureGateInfo,
    KubeVirtComponent,
    KubeVirtCondition,
    KubeVirtInfo,
)

logger = logging.getLogger(__name__)

_COMPONENT_RESOURCES = {"deployments", "daemonsets"}

_GITHUB_RAW = "https://raw.githubusercontent.com/kubevirt/kubevirt"
_FG_PATH = "pkg/virt-config/featuregate"
_FG_FILES = ["active.go", "inactive.go"]

# Cache: version -> list[FeatureGateInfo]  (without enabled status)
_fg_cache: dict[str, list[dict]] = {}


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

    dev_config = spec.get("configuration", {}).get("developerConfiguration", {})
    feature_gates = dev_config.get("featureGates", [])
    disabled_feature_gates = dev_config.get("disabledFeatureGates", [])

    version = status.get("observedKubeVirtVersion", "")
    all_fg = _get_all_feature_gates(version, feature_gates)

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

    return KubeVirtInfo(
        phase=status.get("phase", "Unknown"),
        operator_version=status.get("operatorVersion", ""),
        observed_version=status.get("observedKubeVirtVersion", ""),
        target_version=status.get("targetKubeVirtVersion", ""),
        registry=status.get("observedKubeVirtRegistry", ""),
        default_architecture=status.get("defaultArchitecture", ""),
        outdated_workloads=status.get("outdatedVirtualMachineInstanceWorkloads", 0),
        feature_gates=feature_gates,
        disabled_feature_gates=disabled_feature_gates,
        all_feature_gates=all_fg,
        conditions=conditions,
        components=components,
        infra_replicas=infra_replicas,
        created_at=metadata.get("creationTimestamp"),
    )


def _get_all_feature_gates(version: str, enabled_gates: list[str]) -> list[FeatureGateInfo]:
    """Get all feature gates for a KubeVirt version, with enabled status."""
    if not version:
        return [FeatureGateInfo(name=fg, enabled=True) for fg in enabled_gates]

    raw_gates = _fetch_feature_gate_registry(version)
    if not raw_gates:
        return [FeatureGateInfo(name=fg, enabled=True) for fg in enabled_gates]

    enabled_set = set(enabled_gates)
    result = []
    seen = set()
    for gate in raw_gates:
        name = gate["name"]
        seen.add(name)
        result.append(
            FeatureGateInfo(
                name=name,
                description=gate.get("description", ""),
                maturity=gate.get("maturity", ""),
                enabled=gate.get("maturity") == "GA" or name in enabled_set,
            )
        )

    # Add any enabled gates not found in the registry (custom/unknown)
    for fg in enabled_gates:
        if fg not in seen:
            result.append(FeatureGateInfo(name=fg, enabled=True))

    return result


def _fetch_feature_gate_registry(version: str) -> list[dict]:
    """Fetch and parse feature gate definitions from KubeVirt GitHub source."""
    if version in _fg_cache:
        return _fg_cache[version]

    gates: list[dict] = []
    for filename in _FG_FILES:
        url = f"{_GITHUB_RAW}/{version}/{_FG_PATH}/{filename}"
        try:
            resp = httpx.get(url, timeout=10, follow_redirects=True)
            if resp.status_code != 200:
                logger.warning("Failed to fetch %s: HTTP %d", url, resp.status_code)
                continue
            gates.extend(_parse_go_feature_gates(resp.text))
        except Exception:
            logger.warning("Failed to fetch feature gates from %s", url, exc_info=True)
            continue

    if gates:
        _fg_cache[version] = gates
    return gates


# Regex: matches RegisterFeatureGate(FeatureGate{Name: ConstName, State: Alpha})
_REGISTER_RE = re.compile(r"RegisterFeatureGate\(FeatureGate\{Name:\s*(\w+),\s*State:\s*(\w+)")

# Regex: matches const assignments like  CPUManager = "CPUManager"
_CONST_RE = re.compile(r'(\w+)\s*=\s*"([^"]+)"')

# Regex: captures comment block above a const (description lines + Owner/Alpha/Beta/GA lines)
_COMMENT_BLOCK_RE = re.compile(r"((?:\s*//[^\n]*\n)+)\s*(\w+)\s*=\s*\"", re.MULTILINE)


def _parse_go_feature_gates(source: str) -> list[dict]:
    """Parse Go source to extract feature gate name, description, and maturity."""
    # Build const name -> string value map
    const_map: dict[str, str] = {}
    for match in _CONST_RE.finditer(source):
        const_map[match.group(1)] = match.group(2)

    # Build const name -> description from comment blocks
    desc_map: dict[str, str] = {}
    for match in _COMMENT_BLOCK_RE.finditer(source):
        comment_block = match.group(1)
        const_name = match.group(2)
        lines = []
        for line in comment_block.strip().splitlines():
            text = line.strip().lstrip("/").strip()
            # Skip metadata lines
            if re.match(r"^(Owner|Alpha|Beta|GA|Deprecated|Discontinued):", text):
                continue
            if text:
                lines.append(text)
        if lines:
            desc_map[const_name] = " ".join(lines)

    # Build registered gates from init() calls
    gates = []
    for match in _REGISTER_RE.finditer(source):
        const_name = match.group(1)
        state = match.group(2)
        string_name = const_map.get(const_name, const_name)
        description = desc_map.get(const_name, "")
        gates.append({"name": string_name, "description": description, "maturity": state})

    return gates
