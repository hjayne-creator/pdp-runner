from typing import Optional, List, Any, Dict
from datetime import datetime
from pydantic import BaseModel, HttpUrl


# ── Customer ──────────────────────────────────────────────────────────────────

class CustomerBase(BaseModel):
    name: str
    slug: str
    description: Optional[str] = None
    active: bool = True


class CustomerCreate(CustomerBase):
    pass


class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    description: Optional[str] = None
    active: Optional[bool] = None


class CustomerOut(CustomerBase):
    id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Prompt ────────────────────────────────────────────────────────────────────

class PromptBase(BaseModel):
    name: str
    description: Optional[str] = None
    content: str
    tags: List[str] = []
    active: bool = True


class PromptCreate(PromptBase):
    customer_id: str


class PromptUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    content: Optional[str] = None
    tags: Optional[List[str]] = None
    active: Optional[bool] = None


class PromptOut(PromptBase):
    id: str
    customer_id: str
    version: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── AIModel ───────────────────────────────────────────────────────────────────

class AIModelBase(BaseModel):
    name: str
    display_name: str
    provider: str
    model_id: str
    description: Optional[str] = None
    max_tokens: int = 8192
    supports_streaming: bool = True
    active: bool = True
    config: Dict[str, Any] = {}


class AIModelCreate(AIModelBase):
    pass


class AIModelUpdate(BaseModel):
    name: Optional[str] = None
    display_name: Optional[str] = None
    provider: Optional[str] = None
    model_id: Optional[str] = None
    description: Optional[str] = None
    max_tokens: Optional[int] = None
    supports_streaming: Optional[bool] = None
    active: Optional[bool] = None
    config: Optional[Dict[str, Any]] = None


class AIModelOut(AIModelBase):
    id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Report Templates ───────────────────────────────────────────────────────────

class ReportTemplateBase(BaseModel):
    key: str
    label: str
    description: Optional[str] = None
    output_contract: str
    active: bool = True
    sort_order: int = 100


class ReportTemplateCreate(ReportTemplateBase):
    pass


class ReportTemplateUpdate(BaseModel):
    key: Optional[str] = None
    label: Optional[str] = None
    description: Optional[str] = None
    output_contract: Optional[str] = None
    active: Optional[bool] = None
    sort_order: Optional[int] = None


class ReportTemplateOut(ReportTemplateBase):
    id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Job ───────────────────────────────────────────────────────────────────────

class JobCreate(BaseModel):
    customer_id: str
    prompt_id: str
    model_id: str
    input_url: str
    report_template: str = "pdp-audit-v1"


class JobOut(BaseModel):
    id: str
    customer_id: str
    prompt_id: str
    model_id: str
    report_template: str = "pdp-audit-v1"
    input_url: str
    pdp_data: Optional[Dict[str, Any]] = None
    prompt_rendered: Optional[str] = None
    output: Optional[str] = None
    output_tokens: Optional[int] = None
    input_tokens: Optional[int] = None
    status: str
    error: Optional[str] = None
    duration_ms: Optional[int] = None
    created_at: datetime
    completed_at: Optional[datetime] = None
    customer: Optional[CustomerOut] = None
    prompt: Optional[PromptOut] = None
    model: Optional[AIModelOut] = None

    class Config:
        from_attributes = True


# ── PDP ───────────────────────────────────────────────────────────────────────

class PDPData(BaseModel):
    url: str
    title: Optional[str] = None
    description: Optional[str] = None
    price: Optional[str] = None
    attributes: Dict[str, str] = {}
    images: List[str] = []
    raw_text: Optional[str] = None
    error: Optional[str] = None
