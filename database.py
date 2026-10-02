"""Small SQLite data-access layer for sticky notes."""

from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator


DEFAULT_DB_PATH = Path(__file__).with_name("sticky_notes.db")
DB_PATH = Path(os.getenv("STICKY_NOTES_DB", str(DEFAULT_DB_PATH)))


@contextmanager
def get_connection() -> Iterator[sqlite3.Connection]:
    """Yield a connection and always close it after commit or rollback."""

    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def init_db() -> None:
    """Create the database schema if this is the first application launch."""

    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with get_connection() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL DEFAULT '',
                content TEXT NOT NULL,
                color TEXT NOT NULL DEFAULT '#fff6a5',
                position INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_notes_created_at
                ON notes (created_at DESC, id DESC);
            """
        )

        # Migrate databases created before manual ordering was introduced.
        columns = {
            row[1]
            for row in connection.execute("PRAGMA table_info(notes)").fetchall()
        }
        if "position" not in columns:
            connection.execute("ALTER TABLE notes ADD COLUMN position INTEGER")
            existing_ids = connection.execute(
                """
                SELECT id
                FROM notes
                ORDER BY created_at DESC, id DESC
                """
            ).fetchall()
            for position, row in enumerate(existing_ids):
                connection.execute(
                    "UPDATE notes SET position = ? WHERE id = ?",
                    (position, row[0]),
                )

        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_notes_position
                ON notes (position ASC, id ASC)
            """
        )


def _as_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    return dict(row) if row is not None else None


def list_notes() -> list[dict[str, Any]]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT id, title, content, color, created_at, updated_at
            FROM notes
            ORDER BY position ASC, created_at DESC, id DESC
            """
        ).fetchall()
    return [dict(row) for row in rows]


def get_note(note_id: int) -> dict[str, Any] | None:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT id, title, content, color, created_at, updated_at
            FROM notes
            WHERE id = ?
            """,
            (note_id,),
        ).fetchone()
    return _as_dict(row)


def create_note(*, title: str, content: str, color: str) -> dict[str, Any]:
    with get_connection() as connection:
        connection.execute("UPDATE notes SET position = position + 1")
        cursor = connection.execute(
            """
            INSERT INTO notes (title, content, color, position)
            VALUES (?, ?, ?, 0)
            """,
            (title, content, color),
        )
        note_id = cursor.lastrowid
    note = get_note(int(note_id))
    if note is None:  # Defensive guard; INSERT succeeded above.
        raise RuntimeError("Created note could not be loaded.")
    return note


def update_note(
    note_id: int, *, title: str, content: str, color: str
) -> dict[str, Any] | None:
    with get_connection() as connection:
        cursor = connection.execute(
            """
            UPDATE notes
            SET title = ?, content = ?, color = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (title, content, color, note_id),
        )
        if cursor.rowcount == 0:
            return None
    return get_note(note_id)


def delete_note(note_id: int) -> bool:
    with get_connection() as connection:
        cursor = connection.execute("DELETE FROM notes WHERE id = ?", (note_id,))
        return cursor.rowcount > 0


def reorder_notes(note_ids: list[int]) -> list[dict[str, Any]]:
    """Persist the user-selected order, where index zero is the top note."""

    with get_connection() as connection:
        for position, note_id in enumerate(note_ids):
            connection.execute(
                "UPDATE notes SET position = ? WHERE id = ?",
                (position, note_id),
            )
    return list_notes()
