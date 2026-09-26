import os


def _int_env(name: str, default: int) -> int:
    return int(os.environ.get(name, str(default)))


class Config:
    postgres_host = os.environ.get("POSTGRES_HOST", "localhost")
    postgres_port = _int_env("POSTGRES_PORT", 5432)
    postgres_db = os.environ.get("POSTGRES_DB", "hermes_observability")
    postgres_user = os.environ.get("POSTGRES_USER", "hermes")
    postgres_password = os.environ.get("POSTGRES_PASSWORD", "")

    check_interval_seconds = _int_env("ANOMALY_CHECK_INTERVAL_SECONDS", 300)

    anomaly_lookback_hours = _int_env("ANOMALY_LOOKBACK_HOURS", 6)
    anomaly_window_minutes = _int_env("ANOMALY_WINDOW_MINUTES", 15)
    anomaly_min_samples = _int_env("ANOMALY_MIN_SAMPLES", 30)

    recommendation_cooldown_hours = _int_env("RECOMMENDATION_COOLDOWN_HOURS", 6)


config = Config()
