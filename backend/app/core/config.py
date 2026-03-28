from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="KUBEVMUI_", env_file=".env", extra="ignore")

    app_name: str = "kubevmui"
    debug: bool = False
    cors_origins: list[str] = ["http://localhost:5173"]
    kubeconfig_path: str | None = None
    prometheus_url: str = "http://prometheus-prometheus.monitoring:9090"

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: str | list[str]) -> list[str]:
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",")]
        return v


settings = Settings()
