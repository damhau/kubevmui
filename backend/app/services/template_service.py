import json
from datetime import UTC, datetime

from kubernetes import client

from app.models.template import Template, TemplateCreate
from app.models.vm import VMCompute

TEMPLATE_LABEL = "kubevmui.io/type"
TEMPLATE_LABEL_VALUE = "template"
CM_PREFIX = "tpl-"


def _cm_to_template(cm) -> Template:
    """Deserialize a ConfigMap to our Template model."""
    metadata = cm.metadata
    data = cm.data or {}

    spec_str = data.get("spec", "{}")
    try:
        spec = json.loads(spec_str)
    except (json.JSONDecodeError, TypeError):
        spec = {}

    created_at = None
    if metadata.creation_timestamp:
        ts = metadata.creation_timestamp
        if hasattr(ts, "isoformat"):
            created_at = ts.replace(tzinfo=UTC) if ts.tzinfo is None else ts
        else:
            try:
                created_at = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
            except ValueError:
                created_at = datetime.now(tz=UTC)

    labels = metadata.labels or {}
    annotations = metadata.annotations or {}

    compute_data = spec.get("compute", {})
    compute = VMCompute(
        cpu_cores=compute_data.get("cpu_cores", 1),
        memory_mb=compute_data.get("memory_mb", 512),
        cpu_model=compute_data.get("cpu_model"),
        sockets=compute_data.get("sockets", 1),
        cores_per_socket=compute_data.get("cores_per_socket"),
        threads_per_core=compute_data.get("threads_per_core", 1),
    )

    name = metadata.name
    if name.startswith(CM_PREFIX):
        name = name[len(CM_PREFIX):]

    return Template(
        name=name,
        namespace=metadata.namespace,
        created_at=created_at,
        labels=labels,
        annotations=annotations,
        display_name=spec.get("display_name", name),
        description=spec.get("description", ""),
        category=spec.get("category", "custom"),
        os_type=spec.get("os_type"),
        compute=compute,
        disks=spec.get("disks", []),
        networks=spec.get("networks", []),
        cloud_init_user_data=spec.get("cloud_init_user_data"),
        cloud_init_network_data=spec.get("cloud_init_network_data"),
        autoattach_pod_interface=spec.get("autoattach_pod_interface", True),
    )


class TemplateService:
    def __init__(self, api_client: client.ApiClient):
        self.core_api = client.CoreV1Api(api_client)

    def get_template(self, namespace: str, name: str) -> Template | None:
        try:
            cm = self.core_api.read_namespaced_config_map(f"{CM_PREFIX}{name}", namespace)
            return _cm_to_template(cm)
        except client.ApiException as e:
            if e.status == 404:
                return None
            raise

    def list_templates(self, namespace: str) -> list[Template]:
        label_selector = f"{TEMPLATE_LABEL}={TEMPLATE_LABEL_VALUE}"
        result = self.core_api.list_namespaced_config_map(
            namespace, label_selector=label_selector,
        )
        return [_cm_to_template(cm) for cm in result.items]

    def create_template(self, request: TemplateCreate) -> Template:
        spec = {
            "display_name": request.display_name,
            "description": request.description,
            "category": request.category,
            "os_type": request.os_type,
            "compute": request.compute.model_dump(),
            "disks": [d.model_dump() for d in request.disks],
            "networks": [n.model_dump() for n in request.networks],
            "cloud_init_user_data": request.cloud_init_user_data,
            "cloud_init_network_data": request.cloud_init_network_data,
            "autoattach_pod_interface": request.autoattach_pod_interface,
        }

        cm = client.V1ConfigMap(
            api_version="v1",
            kind="ConfigMap",
            metadata=client.V1ObjectMeta(
                name=f"{CM_PREFIX}{request.name}",
                namespace=request.namespace,
                labels={TEMPLATE_LABEL: TEMPLATE_LABEL_VALUE},
            ),
            data={"spec": json.dumps(spec)},
        )
        created = self.core_api.create_namespaced_config_map(request.namespace, cm)
        return _cm_to_template(created)

    def delete_template(self, namespace: str, name: str) -> None:
        self.core_api.delete_namespaced_config_map(f"{CM_PREFIX}{name}", namespace)
