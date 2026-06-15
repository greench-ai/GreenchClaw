#!/usr/bin/env python3
"""Session Search — FTS5 full-text search over GreenchClaw session history."""
import json
import sqlite3
import os
import sys
from pathlib import Path
from typing import Iterator

SESSIONS_DIR = Path.home() / ".GreenchClaw" / "agents" / "main" / "sessions"
DB_PATH = Path.home() / ".GreenchClaw" / "agents" / "main" / "sessions_fts.db"


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH), isolation_level=None)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    return conn


def ensure_schema(conn: sqlite3.Connection) -> None:
    conn.execute("""
        CREATE VIRTUAL TABLE IF NOT EXISTS sessions_fts USING fts5(
            session_id, session_label, role, content, timestamp, token_id UNINDEXED
        )
    """)
    conn.execute("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS indexed_sessions (session_file TEXT PRIMARY KEY, last_indexed REAL)
    """)


def extract_messages(path: Path) -> Iterator[dict]:
    try:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if obj.get("type") != "message":
                    continue
                msg = obj.get("message", {})
                role = msg.get("role", "")
                if role not in ("user", "assistant"):
                    continue
                content_parts = []
                for block in msg.get("content", []):
                    if isinstance(block, dict):
                        bt = block.get("type", "")
                        if bt == "text":
                            t = block.get("text", "").strip()
                            if t:
                                content_parts.append(t)
                        elif bt == "thinking":
                            t = block.get("thinking", "").strip()
                            if t:
                                content_parts.append(f"[thinking] {t}")
                content = " ".join(content_parts)
                if not content:
                    continue
                yield {
                    "session_id": obj.get("sessionId", path.stem),
                    "session_label": obj.get("label", ""),
                    "role": role,
                    "content": content,
                    "timestamp": obj.get("timestamp", ""),
                    "token_id": obj.get("id", ""),
                }
    except (OSError, UnicodeDecodeError):
        return


def index_session(conn: sqlite3.Connection, session_path: Path, force: bool = False) -> int:
    mtime = os.path.getmtime(session_path)
    row = conn.execute(
        "SELECT last_indexed FROM indexed_sessions WHERE session_file = ?",
        (str(session_path),)
    ).fetchone()
    if row and not force and mtime <= row[0]:
        return 0

    session_id = session_path.stem
    conn.execute("BEGIN")
    conn.execute("DELETE FROM sessions_fts WHERE session_id = ?", (session_id,))

    count = 0
    batch = []
    for msg in extract_messages(session_path):
        batch.append((
            msg["session_id"], msg["session_label"], msg["role"],
            msg["content"], msg["timestamp"], msg["token_id"]
        ))
        count += 1

    if batch:
        conn.executemany(
            "INSERT INTO sessions_fts VALUES (?, ?, ?, ?, ?, ?)",
            batch
        )

    conn.execute(
        "INSERT OR REPLACE INTO indexed_sessions VALUES (?, ?)",
        (str(session_path), mtime)
    )
    conn.execute("COMMIT")
    return count


def index_all(conn: sqlite3.Connection, force: bool = False) -> dict:
    session_files = [
        f for f in SESSIONS_DIR.glob("*.jsonl")
        if "trajectory" not in f.name
    ]
    total = 0
    errors = 0
    for sf in session_files:
        try:
            n = index_session(conn, sf, force=force)
            total += n
        except Exception as e:
            errors += 1
            print(f"Error indexing {sf.name}: {e}", file=sys.stderr)
    return {"indexed_records": total, "session_files_scanned": len(session_files), "errors": errors}


def search(conn: sqlite3.Connection, query: str, limit: int = 10) -> list:
    if not query.strip():
        return []
    try:
        cursor = conn.execute(
            """
            SELECT session_id, session_label, role,
                   snippet(sessions_fts, 3, '**', '**', '...', 48) AS snippet,
                   timestamp
            FROM sessions_fts
            WHERE sessions_fts MATCH ?
            ORDER BY rank
            LIMIT ?
            """,
            (query, limit)
        )
    except sqlite3.FtsError:
        cursor = conn.execute(
            """
            SELECT session_id, session_label, role,
                   substr(content, 1, 200) || '...' AS snippet,
                   timestamp
            FROM sessions_fts
            WHERE content LIKE ?
            ORDER BY timestamp DESC
            LIMIT ?
            """,
            (f"%{query}%", limit)
        )
    return [
        {"session_id": r[0], "session_label": r[1], "role": r[2], "snippet": r[3], "timestamp": r[4]}
        for r in cursor.fetchall()
    ]


def preview(conn: sqlite3.Connection, session_id: str, limit: int = 5) -> list:
    cursor = conn.execute(
        "SELECT role, substr(content, 1, 300), timestamp FROM sessions_fts "
        "WHERE session_id = ? ORDER BY timestamp DESC LIMIT ?",
        (session_id, limit)
    )
    return [{"role": r[0], "content": r[1], "timestamp": r[2]} for r in cursor.fetchall()]


def stats(conn: sqlite3.Connection) -> dict:
    try:
        records = conn.execute("SELECT COUNT(*) FROM sessions_fts").fetchone()[0]
        sessions = conn.execute("SELECT COUNT(DISTINCT session_id) FROM sessions_fts").fetchone()[0]
        files = conn.execute("SELECT COUNT(*) FROM indexed_sessions").fetchone()[0]
    except sqlite3.FtsError:
        records = sessions = files = 0
    return {"total_records": records, "total_sessions": sessions, "indexed_files": files, "db_path": str(DB_PATH)}


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: session_search.py <index|search|stats|preview> [args]")
        sys.exit(1)

    conn = get_conn()
    ensure_schema(conn)

    cmd = sys.argv[1]
    if cmd == "index":
        result = index_all(conn, force="--force" in sys.argv)
        print(json.dumps(result))
    elif cmd == "search":
        query = sys.argv[2] if len(sys.argv) > 2 else ""
        limit = int(sys.argv[3]) if len(sys.argv) > 3 else 10
        results = search(conn, query, limit)
        print(json.dumps(results, indent=2))
    elif cmd == "stats":
        print(json.dumps(stats(conn), indent=2))
    elif cmd == "preview":
        if len(sys.argv) < 3:
            print("Usage: session_search.py preview <session_id>", file=sys.stderr)
            sys.exit(1)
        print(json.dumps(preview(conn, sys.argv[2]), indent=2))
    else:
        print(f"Unknown command: {cmd}", file=sys.stderr)
        sys.exit(1)

    conn.close()
