from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from kubernetes.client import ApiException

from app.api.exception_handlers import k8s_api_exception_handler, value_error_handler
from app.api.routes import (
    analytics,
    audit,
    auth,
    catalog,
    cluster_lists,
    dashboard,
    events,
    images,
    kubevirt_info,
    metrics,
    migrations,
    namespaces,
    network_crs,
    networks,
    nmstate,
    nodes,
    preview,
    snapshots,
    ssh_keys,
    storage,
    templates,
    vms,
)
from app.api.routes.networks import cluster_router as networks_cluster_router
from app.api.routes.storage import cluster_router as storage_cluster_router
from app.core.cluster_manager import ClusterManager
from app.core.config import settings
from app.core.k8s_client import KubeVirtClient
from app.ws import serial_proxy, vnc_proxy


@asynccontextmanager
async def lifespan(app: FastAPI):
    cm = ClusterManager(
        kubeconfig_path=settings.kubeconfig_path,
        in_cluster=settings.kubeconfig_path is None,
    )
    app.state.cluster_manager = cm
    # Seed default catalog entries
    try:
        from app.services.catalog_service import CatalogService

        api_client = cm.get_api_client("local")
        if api_client:
            svc = CatalogService(KubeVirtClient(api_client))
            count = svc.seed_defaults()
            if count:
                import logging

                logging.getLogger(__name__).info("Seeded %d catalog entries", count)
    except Exception:
        import logging

        logging.getLogger(__name__).warning("Failed to seed catalog entries", exc_info=True)
    # Seed default pod-network CR
    try:
        from app.services.network_cr_service import NetworkCRService

        if api_client:
            net_svc = NetworkCRService(KubeVirtClient(api_client))
            if net_svc.seed_pod_network():
                import logging

                logging.getLogger(__name__).info("Seeded default pod-network CR")
    except Exception:
        import logging

        logging.getLogger(__name__).warning("Failed to seed pod-network CR", exc_info=True)
    yield


def create_app() -> FastAPI:
    application = FastAPI(
        title="kubevmui API",
        version="0.1.0",
        description="KubeVirt virtualization control plane",
        lifespan=lifespan,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    application.add_exception_handler(ApiException, k8s_api_exception_handler)
    application.add_exception_handler(ValueError, value_error_handler)

    @application.get("/api/v1/health")
    async def health():
        return {"status": "ok"}

    application.include_router(catalog.router)
    application.include_router(analytics.router)
    application.include_router(audit.router)
    application.include_router(auth.router)
    application.include_router(images.router)
    application.include_router(snapshots.router)
    application.include_router(migrations.router)
    application.include_router(ssh_keys.router)
    application.include_router(vms.router)
    application.include_router(network_crs.router)
    application.include_router(networks.router)
    application.include_router(nmstate.router)
    application.include_router(networks_cluster_router)
    application.include_router(storage.router)
    application.include_router(storage_cluster_router)
    application.include_router(templates.router)
    application.include_router(dashboard.router)
    application.include_router(namespaces.router)
    application.include_router(nodes.router)
    application.include_router(preview.router)
    application.include_router(metrics.router)
    application.include_router(events.router)
    application.include_router(kubevirt_info.router)
    application.include_router(cluster_lists.router)
    application.include_router(vnc_proxy.router)
    application.include_router(serial_proxy.router)
    return application


app = create_app()
