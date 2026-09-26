import logging

import psycopg
from psycopg.rows import dict_row

from .config import config

logger = logging.getLogger("intelligence.db")


def get_connection():
    return psycopg.connect(
        host=config.postgres_host,
        port=config.postgres_port,
        dbname=config.postgres_db,
        user=config.postgres_user,
        password=config.postgres_password,
    )


def query(conn, sql: str, params: tuple = ()) -> list[dict]:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(sql, params)
        if cur.description is None:
            return []
        return [dict(row) for row in cur.fetchall()]


def execute(conn, sql: str, params: tuple = ()) -> None:
    with conn.cursor() as cur:
        cur.execute(sql, params)
    conn.commit()
