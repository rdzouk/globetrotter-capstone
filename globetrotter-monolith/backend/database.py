"""
Database engine/session setup. Defaults to a local SQLite file when
DATABASE_URL isn't set (so `python app.py` still works with zero
setup for local development), and uses real PostgreSQL when
DATABASE_URL is a postgresql:// URL, per config.py.

Every function in data_access.py opens a session via get_session()
as a context manager, so each request gets its own session and
nothing leaks between requests — the SQL equivalent of the old JSON
file's per-call load()/save().
"""
import os
from contextlib import contextmanager

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

import config
from models import Base

if config.DATABASE_URL:
    DATABASE_URL = config.DATABASE_URL
    engine = create_engine(DATABASE_URL, pool_pre_ping=True)
else:
    # Local development / testing default — a real relational database
    # (so the schema, constraints, and queries are genuinely exercised),
    # just not PostgreSQL specifically. See ARCHITECTURE_AUDIT.md for
    # why: no Postgres server was reachable in the environment this was
    # built in. Swap in a real DATABASE_URL for actual production use.
    DATABASE_URL = "sqlite:///" + os.path.join(os.path.dirname(__file__), "globetrotter.db")
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def init_db():
    """Creates all tables if they don't exist yet. Safe to call every
    startup — it's a no-op if the schema already exists. Production
    deployments should use Alembic migrations (see migrations/)
    instead of relying on this for schema changes after the first
    deploy."""
    if DATABASE_URL.startswith("postgresql"):
        # Gunicorn imports the app in several workers at once. Serialize
        # first-start schema creation so concurrent create_all calls cannot
        # race inside PostgreSQL's system catalogs.
        with engine.begin() as connection:
            connection.execute(text("SELECT pg_advisory_xact_lock(29467)"))
            Base.metadata.create_all(bind=connection)
        return

    Base.metadata.create_all(bind=engine)


@contextmanager
def get_session():
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
