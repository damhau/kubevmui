from pydantic import BaseModel


class CatalogImage(BaseModel):
    source_type: str
    source_url: str
    default_size_gb: int = 20


class CatalogTemplate(BaseModel):
    name: str
    display_name: str
    cpu_cores: int
    memory_mb: int
    disk_size_gb: int | None = None


class CatalogEntry(BaseModel):
    name: str
    display_name: str
    description: str = ""
    category: str = "os"
    os_type: str = "linux"
    icon: str = ""
    maintainer: str = "kubevmui"
    image: CatalogImage
    cloud_init_user_data: str | None = None
    templates: list[CatalogTemplate] = []


class CatalogEntryList(BaseModel):
    items: list[CatalogEntry]
    total: int


class ProvisionRequest(BaseModel):
    namespace: str
    storage_class: str = ""
    templates: list[str]  # variant names to provision, e.g. ["small", "medium"]


class ProvisionResponse(BaseModel):
    image_name: str
    template_names: list[str]


class TemplateStatus(BaseModel):
    name: str
    variant: str
    exists: bool


class CatalogStatus(BaseModel):
    provisioned: bool
    image: dict | None = None  # {"name": ..., "phase": ..., "progress": ...}
    templates: list[TemplateStatus] = []
