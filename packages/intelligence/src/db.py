"""Postgres access — direct connection, no HTTP call to packages/api, same
convention as packages/processor (see docs/adr/0001-*.md).

Uses psycopg (v3), not psycopg2: psycopg2-binary has no prebuilt wheel yet
for newer CPython releases and falls back to a source build requiring
pg_config; psycopg[binary] ships one. Actively maintained, same %s-style
placeholders, so no SQL changes needed."""
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
