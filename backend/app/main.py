from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import auth, dashboard, migrations, namespaces, networks, snapshots, ssh_keys, storage, templates, vms
from app.core.cluster_manager import ClusterManager
from app.core.config import settings
from app.ws import serial_proxy, vnc_proxy


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.cluster_manager = ClusterManager(
        kubeconfig_path=settings.kubeconfig_path,
        in_cluster=settings.kubeconfig_path is None,
    )
    yield


def create_app() -> FastAPI:
    application = FastAPI(
        title="kubevmui API", version="0.1.0",
        description="KubeVirt virtualization control plane",
        lifespan=lifespan,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
    )

    @application.get("/api/v1/health")
    async def health():
        return {"status": "ok"}

    application.include_router(auth.router)
    application.include_router(snapshots.router)
    application.include_router(migrations.router)
    application.include_router(ssh_keys.router)
    application.include_router(vms.router)
    application.include_router(networks.router)
    application.include_router(storage.router)
    application.include_router(templates.router)
    application.include_router(dashboard.router)
    application.include_router(namespaces.router)
    application.include_router(vnc_proxy.router)
    application.include_router(serial_proxy.router)
    return application


app = create_app()
