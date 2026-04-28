from typing import Optional, List, Any, Dict
from datetime import datetime
from pydantic import BaseModel


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
    customer_id: Optional[str] = None
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


# ── Output Formats ────────────────────────────────────────────────────────────

class OutputFormatBase(BaseModel):
    key: str
    label: str
    description: Optional[str] = None
    contract: str
    active: bool = True
    sort_order: int = 100


class OutputFormatCreate(OutputFormatBase):
    pass


class OutputFormatUpdate(BaseModel):
    key: Optional[str] = None
    label: Optional[str] = None
    description: Optional[str] = None
    contract: Optional[str] = None
    active: Optional[bool] = None
    sort_order: Optional[int] = None


class OutputFormatOut(OutputFormatBase):
    id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Report Types ──────────────────────────────────────────────────────────────

class ReportTypeBase(BaseModel):
    key: str
    label: str
    description: Optional[str] = None
    workflow: str = "retail"
    icon: Optional[str] = None
    default_prompt_id: Optional[str] = None
    report_definition_id: Optional[str] = None
    requires_competitor_verification: bool = False
    active: bool = True
    sort_order: int = 100


class ReportTypeCreate(ReportTypeBase):
    pass


class ReportTypeUpdate(BaseModel):
    key: Optional[str] = None
    label: Optional[str] = None
    description: Optional[str] = None
    workflow: Optional[str] = None
    icon: Optional[str] = None
    default_prompt_id: Optional[str] = None
    report_definition_id: Optional[str] = None
    requires_competitor_verification: Optional[bool] = None
    active: Optional[bool] = None
    sort_order: Optional[int] = None


class ReportTypeOut(ReportTypeBase):
    id: str
    created_at: datetime
    updated_at: datetime
    report_definition: Optional["ReportDefinitionOut"] = None

    class Config:
        from_attributes = True


# ── Job ───────────────────────────────────────────────────────────────────────

class JobCreate(BaseModel):
    customer_id: str
    prompt_id: str
    model_id: str
    input_url: str
    report_type_id: Optional[str] = None
    verify_competitors: Optional[bool] = None  # None ⇒ inherit from report type
    selected_competitor_urls: Optional[List[str]] = None


class CompetitorVerifyCreate(BaseModel):
    input_url: str
    report_type_id: Optional[str] = None
    verify_competitors: Optional[bool] = None  # None ⇒ inherit from report type


class VerifiedCompetitorOption(BaseModel):
    url: str
    title: Optional[str] = None
    price: Optional[str] = None
    reason: str
    match_rate: float
    snippet: Optional[str] = None
    scrape_source: Optional[str] = None


class CompetitorVerifyOut(BaseModel):
    verification_enabled: bool
    verification_run: bool
    skipped: bool
    skip_reason: Optional[str] = None
    summary_message: str
    total_candidates: int
    total_verified: int
    options: List[VerifiedCompetitorOption] = []
    competitor_audit: Optional[Dict[str, Any]] = None


class JobOut(BaseModel):
    id: str
    customer_id: str
    prompt_id: str
    model_id: str
    report_type_id: Optional[str] = None
    report_definition_id: Optional[str] = None
    report_definition_version: Optional[int] = None
    report_definition_snapshot: Optional[Dict[str, Any]] = None
    report_parse_warnings: Optional[List[str]] = None
    input_url: str
    pdp_data: Optional[Dict[str, Any]] = None
    competitor_verification: Optional[Dict[str, Any]] = None
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
    report_type: Optional[ReportTypeOut] = None

    class Config:
        from_attributes = True


# ── Report Sections & Definitions ─────────────────────────────────────────────

class ReportSectionBase(BaseModel):
    key: str
    label: str
    description: Optional[str] = None
    schema_json: Dict[str, Any] = {}
    ui_renderer_key: str = "generic"
    active: bool = True
    sort_order: int = 100


class ReportSectionOut(ReportSectionBase):
    id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ReportDefinitionSectionIn(BaseModel):
    report_section_id: str
    position: int


class ReportDefinitionSectionOut(BaseModel):
    id: str
    report_section_id: str
    position: int
    report_section: ReportSectionOut

    class Config:
        from_attributes = True


class ReportDefinitionBase(BaseModel):
    key: str
    name: str
    description: Optional[str] = None
    active: bool = True
    sort_order: int = 100


class ReportDefinitionCreate(ReportDefinitionBase):
    sections: List[ReportDefinitionSectionIn] = []


class ReportDefinitionUpdate(BaseModel):
    key: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    active: Optional[bool] = None
    sort_order: Optional[int] = None
    sections: Optional[List[ReportDefinitionSectionIn]] = None


class ReportDefinitionOut(ReportDefinitionBase):
    id: str
    version: int
    created_at: datetime
    updated_at: datetime
    sections: List[ReportDefinitionSectionOut] = []

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


ReportTypeOut.model_rebuild()
