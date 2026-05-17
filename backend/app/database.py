from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if settings.database_url.startswith("sqlite") else {},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def _add_column_if_missing(conn, table: str, col: str, col_def: str):
    """Add a column to an existing table if it doesn't already exist."""
    import sqlalchemy as sa

    inspector = sa.inspect(engine)
    if not inspector.has_table(table):
        return
    existing = {c["name"] for c in inspector.get_columns(table)}
    if col not in existing:
        conn.execute(sa.text(f"ALTER TABLE {table} ADD COLUMN {col} {col_def}"))


def run_migration(engine):
    import sqlalchemy as sa

    with engine.connect() as conn:
        # posts table
        _add_column_if_missing(conn, "posts", "image_urls", "TEXT")
        _add_column_if_missing(conn, "posts", "view_count", "INTEGER DEFAULT 0")
        _add_column_if_missing(conn, "posts", "status", "VARCHAR(20) DEFAULT 'approved'")
        _add_column_if_missing(conn, "posts", "user_id", "INTEGER REFERENCES users(id) ON DELETE SET NULL")
        _add_column_if_missing(conn, "posts", "ticket_status", "VARCHAR(20)")

        # comments
        _add_column_if_missing(conn, "comments", "user_id", "INTEGER REFERENCES users(id) ON DELETE SET NULL")

        # likes
        _add_column_if_missing(conn, "likes", "user_id", "INTEGER REFERENCES users(id) ON DELETE SET NULL")

        # reports
        _add_column_if_missing(conn, "reports", "user_id", "INTEGER REFERENCES users(id) ON DELETE SET NULL")

        # users
        _add_column_if_missing(conn, "users", "is_banned", "BOOLEAN DEFAULT 0")
        _add_column_if_missing(conn, "users", "fingerprint", "VARCHAR(64)")
        _add_column_if_missing(conn, "users", "role", "VARCHAR(20) DEFAULT 'user'")

        # comments: parent_id for nested replies
        _add_column_if_missing(conn, "comments", "parent_id", "INTEGER REFERENCES comments(id) ON DELETE CASCADE")

        # likes: comment_id for comment likes
        _add_column_if_missing(conn, "likes", "comment_id", "INTEGER REFERENCES comments(id) ON DELETE CASCADE")

        # partial unique index for comment likes
        if sa.inspect(engine).has_table("likes"):
            conn.execute(
                sa.text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS uq_comment_fingerprint "
                    "ON likes(comment_id, fingerprint) WHERE comment_id IS NOT NULL"
                )
            )

        # notifications: comment_id for reply/comment_like notifications
        _add_column_if_missing(conn, "notifications", "comment_id", "INTEGER REFERENCES comments(id) ON DELETE SET NULL")

        conn.commit()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
