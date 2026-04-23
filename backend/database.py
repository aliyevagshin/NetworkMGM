from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:////app/data/nms.db")

_is_sqlite = "sqlite" in DATABASE_URL

if _is_sqlite:
    from sqlalchemy import event

    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragmas(dbapi_conn, _):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")       # concurrent reads while writing
        cur.execute("PRAGMA synchronous=NORMAL")     # safe + faster than FULL
        cur.execute("PRAGMA cache_size=-65536")      # 64 MB page cache
        cur.execute("PRAGMA temp_store=MEMORY")      # temp tables in RAM
        cur.execute("PRAGMA mmap_size=268435456")    # 256 MB memory-mapped I/O
        cur.close()
else:
    engine = create_engine(
        DATABASE_URL,
        pool_size=20,        # support ~30 concurrent scheduler polls
        max_overflow=30,
        pool_pre_ping=True,
        pool_recycle=300,
        pool_timeout=20,
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
