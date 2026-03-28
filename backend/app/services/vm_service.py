from datetime import UTC, datetime

from app.core.k8s_client import KubeVirtClient
from app.models.common import HealthStatus, VMStatus
from app.models.vm import VM, VMCompute, VMCreate, VMDiskRef, VMEvent, VMNetworkRef


def _parse_memory(mem_str: str) -> int:
    """Parse Kubernetes memory string to MiB integer."""
    if not mem_str:
        return 0
    mem_str = mem_str.strip()
    if mem_str.endswith("Gi"):
        return int(float(mem_str[:-2]) * 1024)
    if mem_str.endswith("Mi"):
        return int(float(mem_str[:-2]))
    if mem_str.endswith("Ki"):
        return int(float(mem_str[:-2]) / 1024)
    if mem_str.endswith("Ti"):
        return int(float(mem_str[:-2]) * 1024 * 1024)
    try:
        return int(mem_str) // (1024 * 1024)
    except ValueError:
        return 0


def _map_status(vm: dict, vmi: dict | None) -> VMStatus:
    """Map KubeVirt printableStatus to VMStatus enum."""
    printable = vm.get("status", {}).get("printableStatus", "")
    status_map = {
        "Running": VMStatus.running,
        "Stopped": VMStatus.stopped,
        "Starting": VMStatus.starting,
        "Stopping": VMStatus.stopping,
        "Migrating": VMStatus.migrating,
        "Paused": VMStatus.paused,
        "Provisioning": VMStatus.provisioning,
        "ErrImagePull": VMStatus.error,
        "ImagePullBackOff": VMStatus.error,
        "ErrorUnschedulable": VMStatus.error,
        "CrashLoopBackOff": VMStatus.error,
        "ErrorPvcNotFound": VMStatus.error,
        "ErrorDataVolumeNotFound": VMStatus.error,
        "ErrorUnschedulable": VMStatus.error,
        "WaitingForVolumeBinding": VMStatus.provisioning,
        "Unknown": VMStatus.unknown,
    }
    return status_map.get(printable, VMStatus.unknown)


def _map_health(status: VMStatus, vmi: dict | None) -> HealthStatus:
    """Derive health from status and VMI."""
    if status == VMStatus.error:
        return HealthStatus.critical
    if status == VMStatus.running:
        if vmi:
            conditions = vmi.get("status", {}).get("conditions", [])
            agent_ready = any(
                c.get("type") == "AgentConnected" and c.get("status") == "True"
                for c in conditions
            )
            return HealthStatus.healthy if agent_ready else HealthStatus.unknown
        return HealthStatus.unknown
    return HealthStatus.unknown


def _extract_disks(vm: dict) -> list[VMDiskRef]:
    """Extract disk references from VM spec."""
    disks = []
    spec = vm.get("spec", {}).get("template", {}).get("spec", {})
    disk_list = spec.get("domain", {}).get("devices", {}).get("disks", [])
    volume_list = spec.get("volumes", [])
    volume_map = {v["name"]: v for v in volume_list}

    for disk in disk_list:
        name = disk.get("name", "")
        vol = volume_map.get(name, {})
        size_gb = 0
        if "dataVolume" in vol or "persistentVolumeClaim" in vol:
            size_gb = 0
        disk_iface = disk.get("disk", {})
        disks.append(VMDiskRef(
            name=name,
            size_gb=size_gb,
            bus=disk_iface.get("bus", "virtio"),
            boot_order=disk.get("bootOrder"),
        ))
    return disks


def _extract_networks(vm: dict, vmi: dict | None) -> list[VMNetworkRef]:
    """Extract network references from VM spec."""
    networks = []
    spec = vm.get("spec", {}).get("template", {}).get("spec", {})
    iface_list = spec.get("domain", {}).get("devices", {}).get("interfaces", [])
    network_list = spec.get("networks", [])
    net_map = {n["name"]: n for n in network_list}

    vmi_ifaces = {}
    if vmi:
        for iface in vmi.get("status", {}).get("interfaces", []):
            vmi_ifaces[iface.get("name", "")] = iface

    for iface in iface_list:
        name = iface.get("name", "")
        net = net_map.get(name, {})
        network_profile = ""
        if "multus" in net:
            network_profile = net["multus"].get("networkName", "")
        elif "pod" in net:
            network_profile = "pod"

        vmi_iface = vmi_ifaces.get(name, {})
        networks.append(VMNetworkRef(
            name=name,
            network_profile=network_profile,
            ip_address=vmi_iface.get("ipAddress"),
            mac_address=vmi_iface.get("mac") or iface.get("macAddress"),
        ))
    return networks


def _vm_from_raw(vm: dict, vmi: dict | None) -> VM:
    """Convert raw KubeVirt VM dict to VM model."""
    metadata = vm.get("metadata", {})
    spec = vm.get("spec", {})
    domain = spec.get("template", {}).get("spec", {}).get("domain", {})
    resources = domain.get("resources", {})
    requests = resources.get("requests", {})

    cpu_cores = domain.get("cpu", {}).get("cores", 1)
    memory_str = requests.get("memory", "512Mi")
    memory_mb = _parse_memory(memory_str)

    status = _map_status(vm, vmi)
    health = _map_health(status, vmi)

    node = None
    ip_addresses = []
    if vmi:
        node = vmi.get("status", {}).get("nodeName")
        for iface in vmi.get("status", {}).get("interfaces", []):
            if ip := iface.get("ipAddress"):
                ip_addresses.append(ip)

    created_at = None
    ts = metadata.get("creationTimestamp")
    if ts:
        try:
            created_at = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        except ValueError:
            created_at = datetime.now(tz=UTC)

    return VM(
        name=metadata.get("name", ""),
        namespace=metadata.get("namespace", ""),
        created_at=created_at,
        labels=metadata.get("labels") or {},
        annotations=metadata.get("annotations") or {},
        status=status,
        health=health,
        compute=VMCompute(
            cpu_cores=cpu_cores,
            memory_mb=memory_mb,
            sockets=domain.get("cpu", {}).get("sockets", 1),
            threads_per_core=domain.get("cpu", {}).get("threads", 1),
        ),
        disks=_extract_disks(vm),
        networks=_extract_networks(vm, vmi),
        node=node,
        ip_addresses=ip_addresses,
        os_type=metadata.get("labels", {}).get("kubevmui.io/os-type"),
        run_strategy=spec.get("runStrategy", "RerunOnFailure"),
        description=metadata.get("annotations", {}).get("kubevmui.io/description", ""),
        template_name=metadata.get("labels", {}).get("kubevmui.io/template"),
    )


def _build_manifest(request: VMCreate) -> dict:
    """Build a KubeVirt VirtualMachine manifest from a VMCreate request."""
    disks = []
    volumes = []
    data_volume_templates = []

    for disk_ref in request.disks:
        disk_entry = {
            "name": disk_ref.name,
            "disk": {"bus": disk_ref.bus},
        }
        if disk_ref.boot_order is not None:
            disk_entry["bootOrder"] = disk_ref.boot_order
        disks.append(disk_entry)
        if disk_ref.source_type == "container_disk":
            volumes.append({
                "name": disk_ref.name,
                "containerDisk": {"image": disk_ref.image},
            })
        elif disk_ref.source_type == "datavolume_clone":
            dv_name = f"{request.name}-{disk_ref.name}-dv"
            dv_template = {
                "metadata": {"name": dv_name},
                "spec": {
                    "source": {
                        "pvc": {
                            "name": disk_ref.clone_source,
                            "namespace": disk_ref.clone_namespace or request.namespace,
                        },
                    },
                    "pvc": {
                        "accessModes": ["ReadWriteOnce"],
                        "resources": {"requests": {"storage": f"{disk_ref.size_gb}Gi"}},
                    },
                },
            }
            if disk_ref.storage_class:
                dv_template["spec"]["pvc"]["storageClassName"] = disk_ref.storage_class
            data_volume_templates.append(dv_template)
            volumes.append({
                "name": disk_ref.name,
                "dataVolume": {"name": dv_name},
            })
        else:
            volumes.append({
                "name": disk_ref.name,
                "persistentVolumeClaim": {"claimName": disk_ref.name},
            })

    if request.cloud_init_user_data or request.cloud_init_network_data:
        disks.append({"name": "cloudinit", "disk": {"bus": "virtio"}})
        cloud_init_vol: dict = {"name": "cloudinit", "cloudInitNoCloud": {}}
        if request.cloud_init_user_data:
            cloud_init_vol["cloudInitNoCloud"]["userData"] = request.cloud_init_user_data
        if request.cloud_init_network_data:
            cloud_init_vol["cloudInitNoCloud"]["networkData"] = request.cloud_init_network_data
        volumes.append(cloud_init_vol)

    interfaces = []
    networks = []
    for net_ref in request.networks:
        iface: dict = {"name": net_ref.name}
        if net_ref.mac_address:
            iface["macAddress"] = net_ref.mac_address
        if net_ref.network_profile == "pod":
            iface["masquerade"] = {}
            networks.append({"name": net_ref.name, "pod": {}})
        else:
            iface["bridge"] = {}
            networks.append({
                "name": net_ref.name,
                "multus": {"networkName": net_ref.network_profile},
            })
        interfaces.append(iface)

    labels = {**request.labels}
    if request.os_type:
        labels["kubevmui.io/os-type"] = request.os_type
    if request.template_name:
        labels["kubevmui.io/template"] = request.template_name

    annotations = {}
    if request.description:
        annotations["kubevmui.io/description"] = request.description

    domain = {
        "cpu": {
            "cores": request.compute.cpu_cores,
            "sockets": request.compute.sockets,
            "threads": request.compute.threads_per_core,
        },
        "resources": {
            "requests": {"memory": f"{request.compute.memory_mb}Mi"},
        },
        "devices": {
            "disks": disks,
            "interfaces": interfaces,
        },
    }

    if not request.autoattach_pod_interface:
        domain["devices"]["autoattachPodInterface"] = False

    if request.firmware_boot_mode:
        firmware = {}
        if request.firmware_boot_mode == "uefi":
            firmware["bootloader"] = {"efi": {"secureBoot": request.secure_boot}}
        elif request.firmware_boot_mode == "bios":
            firmware["bootloader"] = {"bios": {}}
        domain["firmware"] = firmware

    spec_section = {
        "domain": domain,
        "networks": networks,
        "volumes": volumes,
    }

    if request.node_selector:
        spec_section["nodeSelector"] = request.node_selector
    if request.tolerations:
        spec_section["tolerations"] = [
            {
                "key": t["key"],
                "operator": t.get("operator", "Equal"),
                "value": t.get("value", ""),
                "effect": t.get("effect", "NoSchedule"),
            }
            for t in request.tolerations
        ]
    if request.eviction_strategy:
        spec_section["evictionStrategy"] = request.eviction_strategy

    manifest = {
        "apiVersion": "kubevirt.io/v1",
        "kind": "VirtualMachine",
        "metadata": {
            "name": request.name,
            "namespace": request.namespace,
            "labels": labels,
            "annotations": annotations,
        },
        "spec": {
            "runStrategy": request.run_strategy,
            "template": {
                "metadata": {"labels": {"kubevirt.io/domain": request.name}},
                "spec": spec_section,
            },
        },
    }

    if data_volume_templates:
        manifest["spec"]["dataVolumeTemplates"] = data_volume_templates

    return manifest


class VMService:
    def __init__(self, kv: KubeVirtClient):
        self.kv = kv

    def list_vms(self, namespace: str) -> list[VM]:
        vms_raw = self.kv.list_vms(namespace)
        vmis_raw = self.kv.list_vmis(namespace)
        vmi_map = {
            v.get("metadata", {}).get("name", ""): v for v in vmis_raw
        }
        return [_vm_from_raw(vm, vmi_map.get(vm.get("metadata", {}).get("name", "")))
                for vm in vms_raw]

    def get_vm(self, namespace: str, name: str) -> VM | None:
        vm_raw = self.kv.get_vm(namespace, name)
        if vm_raw is None:
            return None
        vmi_raw = self.kv.get_vmi(namespace, name)
        vm = _vm_from_raw(vm_raw, vmi_raw)
        try:
            raw_events = self.kv.list_events(
                namespace,
                field_selector=f"involvedObject.name={name},involvedObject.kind=VirtualMachine",
            )
            # Also get VMI events
            raw_events += self.kv.list_events(
                namespace,
                field_selector=f"involvedObject.name={name},involvedObject.kind=VirtualMachineInstance",
            )
            vm.events = [
                VMEvent(
                    timestamp=e.get("timestamp", ""),
                    type=e.get("type", ""),
                    reason=e.get("reason", ""),
                    message=e.get("message", ""),
                )
                for e in sorted(raw_events, key=lambda x: x.get("timestamp", ""), reverse=True)
            ]
        except Exception:
            vm.events = []
        return vm

    def create_vm(self, request: VMCreate) -> VM:
        manifest = _build_manifest(request)
        raw = self.kv.create_vm(request.namespace, manifest)
        return _vm_from_raw(raw, None)

    def delete_vm(self, namespace: str, name: str) -> None:
        self.kv.delete_vm(namespace, name)

    def vm_action(self, namespace: str, name: str, action: str) -> None:
        self.kv.vm_action(namespace, name, action)

    def add_volume(self, namespace: str, vm_name: str, name: str, pvc_name: str, bus: str = "scsi") -> None:
        body = {
            "name": name,
            "disk": {"disk": {"bus": bus}, "name": name},
            "volumeSource": {"persistentVolumeClaim": {"claimName": pvc_name, "hotpluggable": True}},
        }
        self.kv.add_volume(namespace, vm_name, body)

    def remove_volume(self, namespace: str, vm_name: str, name: str) -> None:
        self.kv.remove_volume(namespace, vm_name, {"name": name})

    def add_interface(self, namespace: str, vm_name: str, name: str, nad_name: str) -> None:
        body = {
            "name": name,
            "networkAttachmentDefinitionName": nad_name,
        }
        self.kv.add_interface(namespace, vm_name, body)

    def remove_interface(self, namespace: str, vm_name: str, name: str) -> None:
        self.kv.remove_interface(namespace, vm_name, {"name": name})

    def clone_vm(self, namespace: str, source_name: str, new_name: str) -> dict:
        manifest = {
            "apiVersion": "clone.kubevirt.io/v1beta1",
            "kind": "VirtualMachineClone",
            "metadata": {
                "name": f"clone-{source_name}-{int(datetime.now(UTC).timestamp())}",
                "namespace": namespace,
            },
            "spec": {
                "source": {
                    "apiGroup": "kubevirt.io",
                    "kind": "VirtualMachine",
                    "name": source_name,
                },
                "target": {
                    "apiGroup": "kubevirt.io",
                    "kind": "VirtualMachine",
                    "name": new_name,
                },
            },
        }
        return self.kv.create_clone(namespace, manifest)

    def force_stop(self, namespace: str, name: str) -> None:
        """Force stop by patching runStrategy to Halted."""
        body = {"spec": {"runStrategy": "Halted"}}
        self.kv.patch_vm(namespace, name, body)

    def update_run_strategy(self, namespace: str, name: str, strategy: str) -> None:
        body = {"spec": {"runStrategy": strategy}}
        self.kv.patch_vm(namespace, name, body)
