import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, DateTime, Integer, Boolean, ForeignKey, JSON
from sqlalchemy.orm import relationship
from database import Base


def generate_id():
    return str(uuid.uuid4())


def utcnow():
    return datetime.now(timezone.utc)


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
    jobs = relationship("Job", back_populates="prompt")


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


class Job(Base):
    __tablename__ = "jobs"

    id = Column(String, primary_key=True, default=generate_id)
    customer_id = Column(String, ForeignKey("customers.id"), nullable=False)
    prompt_id = Column(String, ForeignKey("prompts.id"), nullable=False)
    model_id = Column(String, ForeignKey("ai_models.id"), nullable=False)

    input_url = Column(String, nullable=False)
    pdp_data = Column(JSON, nullable=True)  # extracted PDP content
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
