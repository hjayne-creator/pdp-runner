from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

SQLALCHEMY_DATABASE_URL = "sqlite:///./pdp_prompt.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def ensure_schema() -> None:
    """Apply lightweight schema patches for local SQLite environments."""
    with engine.begin() as conn:
        table_info = conn.exec_driver_sql("PRAGMA table_info(jobs)").fetchall()
        column_names = {row[1] for row in table_info}
        if "report_template" not in column_names:
            conn.exec_driver_sql(
                "ALTER TABLE jobs ADD COLUMN report_template VARCHAR NOT NULL DEFAULT 'pdp-audit-v1'"
            )


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
