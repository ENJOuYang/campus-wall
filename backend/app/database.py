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


def run_migration(engine):
    import sqlalchemy as sa

    inspector = sa.inspect(engine)
    with engine.connect() as conn:
        if inspector.has_table("posts"):
            columns = {c["name"] for c in inspector.get_columns("posts")}
            if "image_urls" not in columns:
                conn.execute(sa.text("ALTER TABLE posts ADD COLUMN image_urls TEXT"))
            if "view_count" not in columns:
                conn.execute(sa.text("ALTER TABLE posts ADD COLUMN view_count INTEGER DEFAULT 0"))
            if "status" not in columns:
                conn.execute(sa.text("ALTER TABLE posts ADD COLUMN status VARCHAR(20) DEFAULT 'approved'"))
            if "ticket_status" not in columns:
                conn.execute(sa.text("ALTER TABLE posts ADD COLUMN ticket_status VARCHAR(20)"))
            conn.commit()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
