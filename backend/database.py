from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

SQLALCHEMY_DATABASE_URL = "sqlite:///./pdp_prompt.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def _table_exists(conn, name: str) -> bool:
    row = conn.exec_driver_sql(
        "SELECT name FROM sqlite_master WHERE type='table' AND name = ?",
        (name,),
    ).fetchone()
    return row is not None


def _column_names(conn, table: str) -> set[str]:
    rows = conn.exec_driver_sql(f"PRAGMA table_info({table})").fetchall()
    return {row[1] for row in rows}


def ensure_schema() -> None:
    """Apply lightweight schema patches for local SQLite environments.

    Handles two historical migrations:
      1. Legacy ``report_templates`` table + ``jobs.report_template`` string
         column → unified ``report_types`` table + ``jobs.report_type_id`` FK.
      2. Inline ``output_renderer`` + ``output_contract`` columns on
         ``report_types`` → first-class ``output_formats`` table referenced via
         ``report_types.output_format_id``.
    """
    import uuid
    from datetime import datetime, timezone

    with engine.begin() as conn:
        # Jobs table patches (idempotent).
        if _table_exists(conn, "jobs"):
            job_cols = _column_names(conn, "jobs")
            if "competitor_verification" not in job_cols:
                conn.exec_driver_sql(
                    "ALTER TABLE jobs ADD COLUMN competitor_verification JSON"
                )
            if "report_type_id" not in job_cols:
                conn.exec_driver_sql(
                    "ALTER TABLE jobs ADD COLUMN report_type_id VARCHAR"
                )
            if "report_definition_id" not in job_cols:
                conn.exec_driver_sql(
                    "ALTER TABLE jobs ADD COLUMN report_definition_id VARCHAR"
                )
            if "report_definition_version" not in job_cols:
                conn.exec_driver_sql(
                    "ALTER TABLE jobs ADD COLUMN report_definition_version INTEGER"
                )
            if "report_definition_snapshot" not in job_cols:
                conn.exec_driver_sql(
                    "ALTER TABLE jobs ADD COLUMN report_definition_snapshot JSON"
                )
            if "report_parse_warnings" not in job_cols:
                conn.exec_driver_sql(
                    "ALTER TABLE jobs ADD COLUMN report_parse_warnings JSON"
                )

        # Migrate legacy report_templates → report_types (one-time copy).
        if _table_exists(conn, "report_templates") and _table_exists(conn, "report_types"):
            rt_cols = _column_names(conn, "report_types")
            has_legacy_renderer = "output_renderer" in rt_cols
            has_legacy_contract = "output_contract" in rt_cols
            existing_keys = {
                row[0]
                for row in conn.exec_driver_sql(
                    "SELECT key FROM report_types"
                ).fetchall()
            }
            legacy_rows = conn.exec_driver_sql(
                "SELECT id, key, label, description, output_contract, active, sort_order, "
                "created_at, updated_at FROM report_templates"
            ).fetchall()
            for row in legacy_rows:
                key = row[1]
                if key in existing_keys:
                    continue
                renderer = key if key in ("pdp-audit-v1", "pdp-quick-brief-v1") else "pdp-audit-v1"
                # Migrated legacy rows have no default prompt yet; deactivate so
                # the Home picker only shows fully-configured report types.
                # Only insert renderer/contract if those columns still exist on
                # this DB (they may have already been dropped by step 2).
                if has_legacy_renderer and has_legacy_contract:
                    conn.exec_driver_sql(
                        """
                        INSERT INTO report_types
                            (id, key, label, description, workflow, icon,
                             default_prompt_id, output_renderer, output_contract,
                             requires_competitor_verification, active, sort_order,
                             created_at, updated_at)
                        VALUES (?, ?, ?, ?, 'retail', NULL, NULL, ?, ?, 0, 0, ?, ?, ?)
                        """,
                        (
                            row[0], row[1], row[2], row[3], renderer, row[4],
                            row[6] if row[6] is not None else 100,
                            row[7], row[8],
                        ),
                    )
                else:
                    conn.exec_driver_sql(
                        """
                        INSERT INTO report_types
                            (id, key, label, description, workflow, icon,
                             default_prompt_id,
                             requires_competitor_verification, active, sort_order,
                             created_at, updated_at)
                        VALUES (?, ?, ?, ?, 'retail', NULL, NULL, 0, 0, ?, ?, ?)
                        """,
                        (
                            row[0], row[1], row[2], row[3],
                            row[6] if row[6] is not None else 100,
                            row[7], row[8],
                        ),
                    )
                existing_keys.add(key)

        # Backfill jobs.report_type_id from the legacy jobs.report_template column.
        if _table_exists(conn, "jobs") and _table_exists(conn, "report_types"):
            job_cols = _column_names(conn, "jobs")
            if "report_template" in job_cols and "report_type_id" in job_cols:
                conn.exec_driver_sql(
                    """
                    UPDATE jobs
                       SET report_type_id = (
                            SELECT id FROM report_types WHERE key = jobs.report_template
                       )
                     WHERE report_type_id IS NULL
                       AND report_template IS NOT NULL
                    """
                )

        # ── Migration 2: report_types.output_renderer/output_contract → output_formats ──
        if _table_exists(conn, "report_types") and _table_exists(conn, "output_formats"):
            rt_cols = _column_names(conn, "report_types")
            has_legacy_renderer = "output_renderer" in rt_cols
            has_legacy_contract = "output_contract" in rt_cols
            has_format_fk = "output_format_id" in rt_cols
            has_definition_fk = "report_definition_id" in rt_cols

            if not has_format_fk:
                conn.exec_driver_sql(
                    "ALTER TABLE report_types ADD COLUMN output_format_id VARCHAR"
                )
                has_format_fk = True
            if not has_definition_fk:
                conn.exec_driver_sql(
                    "ALTER TABLE report_types ADD COLUMN report_definition_id VARCHAR"
                )

            # If there's still a legacy (renderer, contract) pair on each row,
            # find or create matching OutputFormat rows and link.
            if has_legacy_renderer and has_legacy_contract:
                # Map renderer key → format id (creating a placeholder format if
                # one doesn't already exist for that key). The seed step will
                # later overwrite labels/contracts for the canonical built-ins.
                rt_rows = conn.exec_driver_sql(
                    "SELECT id, output_renderer, output_contract, output_format_id "
                    "FROM report_types"
                ).fetchall()
                now = datetime.now(timezone.utc).isoformat()
                for rt_id, renderer, contract, current_fk in rt_rows:
                    if current_fk:
                        continue
                    if not renderer:
                        continue
                    # Look for an existing OutputFormat by key.
                    existing = conn.exec_driver_sql(
                        "SELECT id FROM output_formats WHERE key = ?",
                        (renderer,),
                    ).fetchone()
                    if existing:
                        fmt_id = existing[0]
                    else:
                        fmt_id = str(uuid.uuid4())
                        conn.exec_driver_sql(
                            """
                            INSERT INTO output_formats
                                (id, key, label, description, contract,
                                 active, sort_order, created_at, updated_at)
                            VALUES (?, ?, ?, NULL, ?, 1, 100, ?, ?)
                            """,
                            (fmt_id, renderer, renderer, contract or "", now, now),
                        )
                    conn.exec_driver_sql(
                        "UPDATE report_types SET output_format_id = ? WHERE id = ?",
                        (fmt_id, rt_id),
                    )

            # Now safe to drop the legacy columns. SQLite >= 3.35 supports
            # DROP COLUMN; older versions will raise — we silently ignore.
            for col in ("output_renderer", "output_contract"):
                if col in _column_names(conn, "report_types"):
                    try:
                        conn.exec_driver_sql(
                            f"ALTER TABLE report_types DROP COLUMN {col}"
                        )
                    except Exception:  # noqa: BLE001
                        # Older SQLite — leave the column. Model no longer
                        # references it so it's a harmless dead column.
                        pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
