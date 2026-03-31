"""Default catalog entry definitions for well-known Linux distributions."""

UBUNTU_CLOUD_INIT = """\
#cloud-config
user: ubuntu
password: ubuntu
chpasswd: {expire: false}
ssh_pwauth: true
package_update: true
packages: [qemu-guest-agent]
runcmd:
  - systemctl enable --now qemu-guest-agent
"""

DEBIAN_CLOUD_INIT = """\
#cloud-config
user: debian
password: debian
chpasswd: {expire: false}
ssh_pwauth: true
package_update: true
packages: [qemu-guest-agent]
runcmd:
  - systemctl enable --now qemu-guest-agent
"""

FEDORA_CLOUD_INIT = """\
#cloud-config
user: fedora
password: fedora
chpasswd: {expire: false}
ssh_pwauth: true
package_update: true
packages: [qemu-guest-agent]
runcmd:
  - systemctl enable --now qemu-guest-agent
"""

CENTOS_CLOUD_INIT = """\
#cloud-config
user: cloud-user
password: centos
chpasswd: {expire: false}
ssh_pwauth: true
package_update: true
packages: [qemu-guest-agent]
runcmd:
  - systemctl enable --now qemu-guest-agent
"""

ROCKY_CLOUD_INIT = """\
#cloud-config
user: rocky
password: rocky
chpasswd: {expire: false}
ssh_pwauth: true
package_update: true
packages: [qemu-guest-agent]
runcmd:
  - systemctl enable --now qemu-guest-agent
"""

ALMA_CLOUD_INIT = """\
#cloud-config
user: almalinux
password: almalinux
chpasswd: {expire: false}
ssh_pwauth: true
package_update: true
packages: [qemu-guest-agent]
runcmd:
  - systemctl enable --now qemu-guest-agent
"""

ALPINE_CLOUD_INIT = """\
#cloud-config
user: alpine
password: alpine
chpasswd: {expire: false}
ssh_pwauth: true
apk_repos:
  - main
  - community
packages: [qemu-guest-agent]
runcmd:
  - rc-update add qemu-guest-agent
  - service qemu-guest-agent start
"""

STANDARD_TEMPLATES = [
    {"name": "small", "displayName": "Small (1 vCPU / 1 GB)", "cpuCores": 1, "memoryMb": 1024},
    {"name": "medium", "displayName": "Medium (2 vCPU / 4 GB)", "cpuCores": 2, "memoryMb": 4096},
    {"name": "large", "displayName": "Large (4 vCPU / 8 GB)", "cpuCores": 4, "memoryMb": 8192},
]

ALPINE_TEMPLATES = [
    {
        "name": "small",
        "displayName": "Small (1 vCPU / 256 MB)",
        "cpuCores": 1,
        "memoryMb": 256,
        "diskSizeGb": 5,
    },
    {
        "name": "medium",
        "displayName": "Medium (1 vCPU / 512 MB)",
        "cpuCores": 1,
        "memoryMb": 512,
        "diskSizeGb": 10,
    },
    {
        "name": "large",
        "displayName": "Large (2 vCPU / 1 GB)",
        "cpuCores": 2,
        "memoryMb": 1024,
        "diskSizeGb": 20,
    },
]


def _entry(
    name: str,
    display_name: str,
    description: str,
    icon: str,
    source_type: str,
    source_url: str,
    default_size_gb: int,
    cloud_init: str,
    templates: list[dict],
) -> dict:
    return {
        "apiVersion": "catalog.kubevmui.io/v1",
        "kind": "CatalogEntry",
        "metadata": {"name": name},
        "spec": {
            "displayName": display_name,
            "description": description,
            "category": "os",
            "osType": "linux",
            "icon": icon,
            "maintainer": "kubevmui",
            "image": {
                "sourceType": source_type,
                "sourceUrl": source_url,
                "defaultSizeGb": default_size_gb,
            },
            "cloudInit": {"userData": cloud_init},
            "templates": templates,
        },
    }


DEFAULT_ENTRIES: list[dict] = [
    _entry(
        name="ubuntu-2404",
        display_name="Ubuntu 24.04 LTS (Noble Numbat)",
        description="General-purpose Linux server distribution with long-term support",
        icon="ubuntu",
        source_type="http",
        source_url="https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img",
        default_size_gb=20,
        cloud_init=UBUNTU_CLOUD_INIT,
        templates=STANDARD_TEMPLATES,
    ),
    _entry(
        name="ubuntu-2204",
        display_name="Ubuntu 22.04 LTS (Jammy Jellyfish)",
        description="Previous LTS release with extended security maintenance",
        icon="ubuntu",
        source_type="http",
        source_url="https://cloud-images.ubuntu.com/jammy/current/jammy-server-cloudimg-amd64.img",
        default_size_gb=20,
        cloud_init=UBUNTU_CLOUD_INIT,
        templates=STANDARD_TEMPLATES,
    ),
    _entry(
        name="debian-12",
        display_name="Debian 12 (Bookworm)",
        description="Stable and reliable community-driven Linux distribution",
        icon="debian",
        source_type="http",
        source_url="https://cloud.debian.org/images/cloud/bookworm/latest/debian-12-generic-amd64.qcow2",
        default_size_gb=10,
        cloud_init=DEBIAN_CLOUD_INIT,
        templates=STANDARD_TEMPLATES,
    ),
    _entry(
        name="debian-11",
        display_name="Debian 11 (Bullseye)",
        description="Previous stable release with long-term support",
        icon="debian",
        source_type="http",
        source_url="https://cloud.debian.org/images/cloud/bullseye/latest/debian-11-generic-amd64.qcow2",
        default_size_gb=10,
        cloud_init=DEBIAN_CLOUD_INIT,
        templates=STANDARD_TEMPLATES,
    ),
    _entry(
        name="fedora-41",
        display_name="Fedora 41",
        description="Cutting-edge Linux distribution sponsored by Red Hat",
        icon="fedora",
        source_type="http",
        source_url="https://download.fedoraproject.org/pub/fedora/linux/releases/41/Cloud/x86_64/images/Fedora-Cloud-Base-Generic-41-1.4.x86_64.qcow2",
        default_size_gb=20,
        cloud_init=FEDORA_CLOUD_INIT,
        templates=STANDARD_TEMPLATES,
    ),
    _entry(
        name="centos-stream-9",
        display_name="CentOS Stream 9",
        description="Continuously delivered Linux distribution tracking ahead of RHEL",
        icon="centos",
        source_type="http",
        source_url="https://cloud.centos.org/centos/9-stream/x86_64/images/CentOS-Stream-GenericCloud-9-latest.x86_64.qcow2",
        default_size_gb=20,
        cloud_init=CENTOS_CLOUD_INIT,
        templates=STANDARD_TEMPLATES,
    ),
    _entry(
        name="rocky-9",
        display_name="Rocky Linux 9",
        description="Enterprise-grade Linux distribution compatible with RHEL 9",
        icon="rocky",
        source_type="http",
        source_url="https://dl.rockylinux.org/pub/rocky/9/images/x86_64/Rocky-9-GenericCloud-Base.latest.x86_64.qcow2",
        default_size_gb=20,
        cloud_init=ROCKY_CLOUD_INIT,
        templates=STANDARD_TEMPLATES,
    ),
    _entry(
        name="rocky-10",
        display_name="Rocky Linux 10",
        description="Enterprise-grade Linux distribution compatible with RHEL 10",
        icon="rocky",
        source_type="http",
        source_url="https://dl.rockylinux.org/pub/rocky/10/images/x86_64/Rocky-10-GenericCloud-Base.latest.x86_64.qcow2",
        default_size_gb=20,
        cloud_init=ROCKY_CLOUD_INIT,
        templates=STANDARD_TEMPLATES,
    ),
    _entry(
        name="almalinux-9",
        display_name="AlmaLinux 9",
        description="Community-driven RHEL-compatible enterprise Linux",
        icon="almalinux",
        source_type="http",
        source_url="https://repo.almalinux.org/almalinux/9/cloud/x86_64/images/AlmaLinux-9-GenericCloud-latest.x86_64.qcow2",
        default_size_gb=20,
        cloud_init=ALMA_CLOUD_INIT,
        templates=STANDARD_TEMPLATES,
    ),
    _entry(
        name="alpine-320",
        display_name="Alpine Linux 3.20",
        description="Lightweight security-oriented Linux distribution",
        icon="alpine",
        source_type="http",
        source_url="https://dl-cdn.alpinelinux.org/alpine/v3.20/releases/cloud/nocloud_alpine-3.20.6-x86_64-bios-cloudinit-r0.qcow2",
        default_size_gb=5,
        cloud_init=ALPINE_CLOUD_INIT,
        templates=ALPINE_TEMPLATES,
    ),
]
