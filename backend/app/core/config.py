from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="KUBEVMUI_", env_file=".env", extra="ignore")

    app_name: str = "kubevmui"
    debug: bool = False
    cors_origins: list[str] = ["http://localhost:5173"]
    kubeconfig_path: str | None = None
    prometheus_url: str = "http://prometheus-prometheus.monitoring:9090"
    cdi_namespace: str = "cdi"
    # VM Import
    kubevmui_import_max_concurrent: int = 2
    kubevmui_import_max_ova_size_gb: int = 50
    kubevmui_import_staging_dir: str = "/tmp/kubevmui-imports"  # noqa: S108

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: str | list[str]) -> list[str]:
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",")]
        return v


settings = Settings()
