"""SQLite storage for the 30-day session-scoped detection history."""

from __future__ import annotations

import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parent
_HISTORY_PATH = Path(os.getenv("HISTORY_DB_PATH", str(BASE_DIR / "history.db")))
DB_FILE = _HISTORY_PATH if _HISTORY_PATH.is_absolute() else BASE_DIR / _HISTORY_PATH
RETENTION_DAYS = max(1, int(os.getenv("HISTORY_RETENTION_DAYS", "30")))
MAX_PER_SESSION = max(1, int(os.getenv("HISTORY_MAX_PER_SESSION", "100")))


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _iso_days_ago(days: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")


@contextmanager
def _connection():
    connection = sqlite3.connect(str(DB_FILE), timeout=15, isolation_level=None)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA busy_timeout = 15000")
    try:
        yield connection
    finally:
        connection.close()


def init_db() -> None:
    DB_FILE.parent.mkdir(parents=True, exist_ok=True)
    with _connection() as connection:
        connection.execute("PRAGMA journal_mode = WAL")
        connection.execute("PRAGMA synchronous = NORMAL")
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS detection_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                media_type TEXT NOT NULL,
                file_name TEXT NOT NULL,
                mode TEXT NOT NULL,
                model_name TEXT NOT NULL,
                summary_json TEXT NOT NULL,
                params_json TEXT NOT NULL,
                width INTEGER,
                height INTEGER,
                duration REAL,
                file_size INTEGER,
                inference_ms REAL,
                thumbnail BLOB,
                thumbnail_mime TEXT NOT NULL DEFAULT 'image/jpeg',
                created_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_history_session_created
            ON detection_history(session_id, id DESC);

            CREATE INDEX IF NOT EXISTS idx_history_created_at
            ON detection_history(created_at);
            """
        )
        _remove_expired(connection)


def _remove_expired(connection: sqlite3.Connection) -> None:
    connection.execute(
        "DELETE FROM detection_history WHERE created_at < ?",
        (_iso_days_ago(RETENTION_DAYS),),
    )


def _trim_session(connection: sqlite3.Connection, session_id: str) -> None:
    connection.execute(
        """
        DELETE FROM detection_history
        WHERE session_id = ?
          AND id NOT IN (
              SELECT id FROM detection_history
              WHERE session_id = ?
              ORDER BY id DESC
              LIMIT ?
          )
        """,
        (session_id, session_id, MAX_PER_SESSION),
    )


def save_record(
    *,
    session_id: str,
    media_type: str,
    file_name: str,
    mode: str,
    model_name: str,
    summary: dict[str, Any],
    params: dict[str, Any],
    width: int,
    height: int,
    duration: float | None,
    file_size: int | None,
    inference_ms: float,
    thumbnail: bytes | None,
) -> int:
    created_at = _now_iso()
    with _connection() as connection:
        cursor = connection.execute(
            """
            INSERT INTO detection_history (
                session_id, media_type, file_name, mode, model_name,
                summary_json, params_json, width, height, duration,
                file_size, inference_ms, thumbnail, thumbnail_mime, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                session_id,
                media_type,
                file_name,
                mode,
                model_name,
                json.dumps(summary, ensure_ascii=False, separators=(",", ":")),
                json.dumps(params, ensure_ascii=False, separators=(",", ":")),
                width,
                height,
                duration,
                file_size,
                inference_ms,
                thumbnail,
                "image/jpeg",
                created_at,
            ),
        )
        record_id = int(cursor.lastrowid)
        _trim_session(connection, session_id)
        _remove_expired(connection)
    return record_id


def list_history(session_id: str, limit: int = 20) -> tuple[list[dict], int]:
    safe_limit = max(1, min(limit, 50))
    with _connection() as connection:
        _remove_expired(connection)
        total_row = connection.execute(
            "SELECT COUNT(*) AS count FROM detection_history WHERE session_id = ?",
            (session_id,),
        ).fetchone()
        rows = connection.execute(
            """
            SELECT id, media_type, file_name, mode, model_name, summary_json,
                   width, height, duration, created_at,
                   thumbnail IS NOT NULL AS has_thumbnail
            FROM detection_history
            WHERE session_id = ?
            ORDER BY id DESC
            LIMIT ?
            """,
            (session_id, safe_limit),
        ).fetchall()

    items = []
    for row in rows:
        try:
            summary = json.loads(row["summary_json"])
        except (TypeError, json.JSONDecodeError):
            summary = {"total": 0, "by_class": [], "average_confidence": 0, "peak_objects": 0}
        items.append(
            {
                "id": row["id"],
                "media_type": row["media_type"],
                "file_name": row["file_name"],
                "mode": row["mode"],
                "model_name": row["model_name"],
                "summary": summary,
                "width": row["width"],
                "height": row["height"],
                "duration": row["duration"],
                "created_at": row["created_at"],
                "thumbnail_url": (
                    f"/api/history/{row['id']}/thumbnail" if row["has_thumbnail"] else None
                ),
            }
        )
    return items, int(total_row["count"] if total_row else 0)


def get_thumbnail(session_id: str, record_id: int) -> tuple[bytes, str] | None:
    with _connection() as connection:
        row = connection.execute(
            """
            SELECT thumbnail, thumbnail_mime
            FROM detection_history
            WHERE id = ? AND session_id = ?
            """,
            (record_id, session_id),
        ).fetchone()
    if not row or row["thumbnail"] is None:
        return None
    return bytes(row["thumbnail"]), row["thumbnail_mime"] or "image/jpeg"


def clear_history(session_id: str) -> int:
    with _connection() as connection:
        cursor = connection.execute(
            "DELETE FROM detection_history WHERE session_id = ?", (session_id,)
        )
        return cursor.rowcount or 0
