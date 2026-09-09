"""Periodic sweep loop — mirrors packages/processor/src/alertEngine.ts's
startAlertEngine(): while True: try sweep, sleep(interval); except: log,
sleep(5) and retry."""
import logging
import time

from .anomaly_detector import run_anomaly_sweep
from .config import config
from .db import get_connection
from .recommendations import run_recommendation_sweep

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s")
logger = logging.getLogger("intelligence.main")


def run_sweep() -> None:
    conn = get_connection()
    try:
        run_anomaly_sweep(conn)
        run_recommendation_sweep(conn)
    finally:
        conn.close()


def main() -> None:
    logger.info("Intelligence sweep loop started (interval=%ds)", config.check_interval_seconds)
    while True:
        try:
            run_sweep()
            time.sleep(config.check_interval_seconds)
        except Exception:
            logger.exception("Sweep failed, retrying in 5s")
            time.sleep(5)


if __name__ == "__main__":
    main()
