import logging

from kubernetes.client import ApiException

from app.core.k8s_client import KubeVirtClient
from app.models.catalog import (
    CatalogEntry,
    CatalogImage,
    CatalogStatus,
    CatalogTemplate,
    ProvisionRequest,
    ProvisionResponse,
    TemplateStatus,
)
from app.models.image import ImageCreate
from app.models.template import TemplateCreate
from app.models.vm import VMCompute, VMDiskRef, VMNetworkRef
from app.services.catalog_defaults import DEFAULT_ENTRIES
from app.services.image_service import ImageService
from app.services.template_service import TemplateService

logger = logging.getLogger(__name__)


def _entry_from_raw(raw: dict) -> CatalogEntry:
    metadata = raw.get("metadata", {})
    spec = raw.get("spec", {})
    image_spec = spec.get("image", {})
    cloud_init = spec.get("cloudInit", {})
    templates = [
        CatalogTemplate(
            name=t.get("name", ""),
            display_name=t.get("displayName", ""),
            cpu_cores=t.get("cpuCores", 1),
            memory_mb=t.get("memoryMb", 512),
            disk_size_gb=t.get("diskSizeGb"),
        )
        for t in spec.get("templates", [])
    ]
    return CatalogEntry(
        name=metadata.get("name", ""),
        display_name=spec.get("displayName", ""),
        description=spec.get("description", ""),
        category=spec.get("category", "os"),
        os_type=spec.get("osType", "linux"),
        icon=spec.get("icon", ""),
        maintainer=spec.get("maintainer", "kubevmui"),
        image=CatalogImage(
            source_type=image_spec.get("sourceType", "http"),
            source_url=image_spec.get("sourceUrl", ""),
            default_size_gb=image_spec.get("defaultSizeGb", 20),
        ),
        cloud_init_user_data=cloud_init.get("userData"),
        templates=templates,
    )


class CatalogService:
    def __init__(self, kv: KubeVirtClient):
        self.kv = kv

    def list_entries(self) -> list[CatalogEntry]:
        return [_entry_from_raw(r) for r in self.kv.list_catalog_entries()]

    def get_entry(self, name: str) -> CatalogEntry | None:
        raw = self.kv.get_catalog_entry(name)
        if raw is None:
            return None
        return _entry_from_raw(raw)

    def provision(self, name: str, request: ProvisionRequest) -> ProvisionResponse:
        entry = self.get_entry(name)
        if entry is None:
            raise ValueError(f"Catalog entry '{name}' not found")

        # Validate requested template variants exist in the catalog entry
        valid_variants = {t.name for t in entry.templates}
        for variant in request.templates:
            if variant not in valid_variants:
                raise ValueError(
                    f"Template variant '{variant}' not found in catalog entry '{name}'. "
                    f"Available: {sorted(valid_variants)}"
                )

        namespace = request.namespace
        label_selector = f"catalog.kubevmui.io/entry={name}"

        # Create image if it doesn't exist already
        existing_images = self.kv.list_images_by_label(namespace, label_selector)
        image_name = name
        if not existing_images:
            image_svc = ImageService(self.kv)
            image_req = ImageCreate(
                name=image_name,
                display_name=entry.display_name,
                description=entry.description,
                os_type=entry.os_type,
                source_type=entry.image.source_type,
                source_url=entry.image.source_url,
                size_gb=entry.image.default_size_gb,
                storage_class=request.storage_class,
                is_global=request.is_global,
            )
            image_svc.create_image(namespace, image_req)
            # Add the catalog label to the image
            self._add_catalog_label(namespace, "images", image_name, name)

        # Create templates for each requested variant
        template_svc = TemplateService(self.kv)
        existing_templates = self.kv.list_templates_by_label(namespace, label_selector)
        existing_template_names = {
            t.get("metadata", {}).get("name", "") for t in existing_templates
        }

        created_names = []
        for variant in request.templates:
            tpl_def = next(t for t in entry.templates if t.name == variant)
            tpl_name = f"{name}-{variant}"
            if tpl_name in existing_template_names:
                created_names.append(tpl_name)
                continue
            disk_size = tpl_def.disk_size_gb or entry.image.default_size_gb
            tpl_req = TemplateCreate(
                name=tpl_name,
                namespace=namespace,
                display_name=f"{entry.display_name} — {tpl_def.display_name}",
                description=entry.description,
                category=entry.category,
                os_type=entry.os_type,
                compute=VMCompute(
                    cpu_cores=tpl_def.cpu_cores,
                    memory_mb=tpl_def.memory_mb,
                ),
                disks=[
                    VMDiskRef(
                        name="rootdisk",
                        size_gb=disk_size,
                        bus="virtio",
                        source_type="datavolume_clone",
                        clone_source=image_name,
                        clone_namespace=namespace,
                        storage_class=request.storage_class,
                    )
                ],
                networks=[
                    VMNetworkRef(name="default", network_cr="pod-network"),
                ],
                cloud_init_user_data=entry.cloud_init_user_data,
                is_global=request.is_global,
            )
            template_svc.create_template(tpl_req)
            self._add_catalog_label(namespace, "templates", tpl_name, name)
            created_names.append(tpl_name)

        return ProvisionResponse(image_name=image_name, template_names=created_names)

    def get_status(self, name: str, namespace: str) -> CatalogStatus:
        entry = self.get_entry(name)
        if entry is None:
            return CatalogStatus(provisioned=False)

        label_selector = f"catalog.kubevmui.io/entry={name}"

        # Check image
        images = self.kv.list_images_by_label(namespace, label_selector)
        image_info = None
        if images:
            img_raw = images[0]
            img_name = img_raw.get("metadata", {}).get("name", "")
            # Check DataVolume status
            dv = self.kv.get_datavolume(namespace, img_name)
            phase = ""
            progress = ""
            if dv:
                status = dv.get("status", {})
                phase = status.get("phase", "")
                progress = status.get("progress", "")
            image_info = {"name": img_name, "phase": phase, "progress": progress}

        # Check templates
        templates = self.kv.list_templates_by_label(namespace, label_selector)
        existing_names = {t.get("metadata", {}).get("name", "") for t in templates}
        template_statuses = [
            TemplateStatus(
                name=f"{name}-{t.name}",
                variant=t.name,
                exists=f"{name}-{t.name}" in existing_names,
            )
            for t in entry.templates
        ]

        provisioned = image_info is not None and any(ts.exists for ts in template_statuses)
        return CatalogStatus(
            provisioned=provisioned,
            image=image_info,
            templates=template_statuses,
        )

    def seed_defaults(self) -> int:
        """Create default catalog entries if they don't exist. Returns count created."""
        existing = {e.get("metadata", {}).get("name") for e in self.kv.list_catalog_entries()}
        created = 0
        for entry in DEFAULT_ENTRIES:
            entry_name = entry["metadata"]["name"]
            if entry_name not in existing:
                try:
                    self.kv.create_catalog_entry(entry)
                    created += 1
                    logger.info("Seeded catalog entry: %s", entry_name)
                except ApiException:
                    logger.warning("Failed to seed catalog entry: %s", entry_name, exc_info=True)
        return created

    def _add_catalog_label(self, namespace: str, plural: str, name: str, entry_name: str) -> None:
        """Patch a namespaced resource to add the catalog label."""
        try:
            self.kv.custom_api.patch_namespaced_custom_object(
                group=self.kv.KUBEVMUI_GROUP,
                version=self.kv.KUBEVMUI_VERSION,
                namespace=namespace,
                plural=plural,
                name=name,
                body={"metadata": {"labels": {"catalog.kubevmui.io/entry": entry_name}}},
            )
        except ApiException:
            logger.warning("Failed to add catalog label to %s/%s", plural, name, exc_info=True)
