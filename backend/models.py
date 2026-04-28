import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    String,
    Text,
    DateTime,
    Integer,
    Boolean,
    ForeignKey,
    JSON,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from database import Base


def generate_id():
    return str(uuid.uuid4())


def utcnow():
    return datetime.now(timezone.utc)


class AppSetting(Base):
    """Key/value flags for app-level state (e.g. one-time bootstrap markers)."""

    __tablename__ = "app_settings"

    key = Column(String, primary_key=True)
    value = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


class Customer(Base):
    __tablename__ = "customers"

    id = Column(String, primary_key=True, default=generate_id)
    name = Column(String, nullable=False, unique=True)
    slug = Column(String, nullable=False, unique=True)
    description = Column(Text, nullable=True)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    prompts = relationship("Prompt", back_populates="customer", cascade="all, delete-orphan")
    jobs = relationship("Job", back_populates="customer")


class Prompt(Base):
    __tablename__ = "prompts"

    id = Column(String, primary_key=True, default=generate_id)
    customer_id = Column(String, ForeignKey("customers.id"), nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    content = Column(Text, nullable=False)
    version = Column(Integer, default=1)
    active = Column(Boolean, default=True)
    tags = Column(JSON, default=list)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    customer = relationship("Customer", back_populates="prompts")
    jobs = relationship("Job", back_populates="prompt", cascade="all, delete-orphan")


class AIModel(Base):
    __tablename__ = "ai_models"

    id = Column(String, primary_key=True, default=generate_id)
    name = Column(String, nullable=False)
    display_name = Column(String, nullable=False)
    provider = Column(String, nullable=False)  # openai | anthropic
    model_id = Column(String, nullable=False)  # e.g. gpt-4o, claude-opus-4-5
    description = Column(Text, nullable=True)
    max_tokens = Column(Integer, default=8192)
    supports_streaming = Column(Boolean, default=True)
    active = Column(Boolean, default=True)
    config = Column(JSON, default=dict)  # extra provider-specific config
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    jobs = relationship("Job", back_populates="model")


class OutputFormat(Base):
    """Pairs a frontend renderer key with the JSON contract the AI must produce.

    The ``key`` field doubles as the renderer lookup on the frontend — a known
    key (e.g. ``pdp-audit-v1``) selects a registered React component; an unknown
    key falls back to raw-JSON output. ReportTypes reference an OutputFormat so
    the contract + renderer always travel together.
    """

    __tablename__ = "output_formats"

    id = Column(String, primary_key=True, default=generate_id)
    key = Column(String, nullable=False, unique=True)
    label = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    contract = Column(Text, nullable=False)
    active = Column(Boolean, default=True)
    sort_order = Column(Integer, default=100)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    report_types = relationship("ReportType", back_populates="output_format")


class ReportType(Base):
    """A user-facing analysis option. Wires together a prompt, an output
    format, and behavior flags so Home can render Step 3 from data alone."""

    __tablename__ = "report_types"

    id = Column(String, primary_key=True, default=generate_id)
    key = Column(String, nullable=False, unique=True)
    label = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    workflow = Column(String, nullable=False, default="retail")  # retail | house_brand
    icon = Column(String, nullable=True)  # lucide-react icon name
    default_prompt_id = Column(
        String, ForeignKey("prompts.id", ondelete="SET NULL"), nullable=True
    )
    output_format_id = Column(
        String, ForeignKey("output_formats.id", ondelete="SET NULL"), nullable=True
    )
    report_definition_id = Column(
        String, ForeignKey("report_definitions.id", ondelete="SET NULL"), nullable=True
    )
    requires_competitor_verification = Column(Boolean, default=False)
    active = Column(Boolean, default=True)
    sort_order = Column(Integer, default=100)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    default_prompt = relationship("Prompt", foreign_keys=[default_prompt_id])
    output_format = relationship("OutputFormat", back_populates="report_types")
    report_definition = relationship("ReportDefinition", back_populates="report_types")
    jobs = relationship("Job", back_populates="report_type")


class Job(Base):
    __tablename__ = "jobs"

    id = Column(String, primary_key=True, default=generate_id)
    customer_id = Column(String, ForeignKey("customers.id"), nullable=False)
    prompt_id = Column(String, ForeignKey("prompts.id"), nullable=False)
    model_id = Column(String, ForeignKey("ai_models.id"), nullable=False)
    report_type_id = Column(
        String, ForeignKey("report_types.id", ondelete="SET NULL"), nullable=True
    )
    report_definition_id = Column(
        String, ForeignKey("report_definitions.id", ondelete="SET NULL"), nullable=True
    )
    report_definition_version = Column(Integer, nullable=True)
    report_definition_snapshot = Column(JSON, nullable=True)
    report_parse_warnings = Column(JSON, nullable=True)

    input_url = Column(String, nullable=False)
    pdp_data = Column(JSON, nullable=True)  # extracted PDP content
    competitor_verification = Column(JSON, nullable=True)  # SerpAPI + verify audit
    prompt_rendered = Column(Text, nullable=True)  # final prompt sent to AI
    output = Column(Text, nullable=True)
    output_tokens = Column(Integer, nullable=True)
    input_tokens = Column(Integer, nullable=True)
    status = Column(String, default="pending")  # pending | running | completed | failed
    error = Column(Text, nullable=True)
    duration_ms = Column(Integer, nullable=True)

    created_at = Column(DateTime, default=utcnow)
    completed_at = Column(DateTime, nullable=True)

    customer = relationship("Customer", back_populates="jobs")
    prompt = relationship("Prompt", back_populates="jobs")
    model = relationship("AIModel", back_populates="jobs")
    report_type = relationship("ReportType", back_populates="jobs")
    report_definition = relationship("ReportDefinition", back_populates="jobs")


class ReportSection(Base):
    __tablename__ = "report_sections"

    id = Column(String, primary_key=True, default=generate_id)
    key = Column(String, nullable=False, unique=True)
    label = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    schema_json = Column(JSON, nullable=False, default=dict)
    ui_renderer_key = Column(String, nullable=False, default="generic")
    active = Column(Boolean, default=True)
    sort_order = Column(Integer, default=100)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    definition_links = relationship(
        "ReportDefinitionSection",
        back_populates="report_section",
        cascade="all, delete-orphan",
    )


class ReportDefinition(Base):
    __tablename__ = "report_definitions"

    id = Column(String, primary_key=True, default=generate_id)
    key = Column(String, nullable=False, unique=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    version = Column(Integer, default=1)
    active = Column(Boolean, default=True)
    sort_order = Column(Integer, default=100)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    sections = relationship(
        "ReportDefinitionSection",
        back_populates="report_definition",
        cascade="all, delete-orphan",
        order_by="ReportDefinitionSection.position",
    )
    report_types = relationship("ReportType", back_populates="report_definition")
    jobs = relationship("Job", back_populates="report_definition")


class ReportDefinitionSection(Base):
    __tablename__ = "report_definition_sections"
    __table_args__ = (
        UniqueConstraint("report_definition_id", "position", name="uq_definition_position"),
        UniqueConstraint(
            "report_definition_id",
            "report_section_id",
            name="uq_definition_section_unique",
        ),
    )

    id = Column(String, primary_key=True, default=generate_id)
    report_definition_id = Column(
        String, ForeignKey("report_definitions.id", ondelete="CASCADE"), nullable=False
    )
    report_section_id = Column(
        String, ForeignKey("report_sections.id", ondelete="CASCADE"), nullable=False
    )
    position = Column(Integer, nullable=False, default=100)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    report_definition = relationship("ReportDefinition", back_populates="sections")
    report_section = relationship("ReportSection", back_populates="definition_links")
