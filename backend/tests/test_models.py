from app.models.common import HealthStatus, NetworkType, VMStatus
from app.models.disk import Disk
from app.models.network_profile import NetworkProfile
from app.models.template import Template
from app.models.vm import VM, VMCompute, VMCreate


def test_vm_model():
    vm = VM(
        name="test-vm", namespace="default",
        status=VMStatus.running, health=HealthStatus.healthy,
        compute=VMCompute(cpu_cores=4, memory_mb=8192),
        ip_addresses=["10.244.1.5"], node="node-01",
    )
    assert vm.name == "test-vm"
    assert vm.status == VMStatus.running
    assert vm.compute.cpu_cores == 4

def test_vm_create_minimal():
    req = VMCreate(
        name="my-vm", namespace="default",
        compute=VMCompute(cpu_cores=2, memory_mb=4096),
    )
    assert req.run_strategy == "RerunOnFailure"
    assert req.disks == []

def test_disk_model():
    disk = Disk(
        name="data-disk", namespace="default",
        size_gb=100, performance_tier="Standard", storage_class="longhorn",
    )
    assert disk.size_gb == 100
    assert disk.attached_vm is None

def test_network_profile_model():
    np = NetworkProfile(
        name="office-lan", namespace="default",
        display_name="Office LAN", network_type=NetworkType.bridge,
        vlan_id=100, dhcp_enabled=True, connected_vm_count=5,
    )
    assert np.vlan_id == 100
    assert np.network_type == NetworkType.bridge

def test_template_model():
    tpl = Template(
        name="ubuntu-2404", namespace="default",
        display_name="Ubuntu 24.04 LTS", category="linux", os_type="linux",
        compute=VMCompute(cpu_cores=2, memory_mb=4096),
    )
    assert tpl.category == "linux"
