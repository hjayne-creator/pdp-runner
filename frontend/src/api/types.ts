export interface Customer {
  id: string;
  name: string;
  slug: string;
  description?: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Prompt {
  id: string;
  customer_id: string;
  name: string;
  description?: string;
  content: string;
  version: number;
  active: boolean;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface AIModel {
  id: string;
  name: string;
  display_name: string;
  provider: string;
  model_id: string;
  description?: string;
  max_tokens: number;
  supports_streaming: boolean;
  active: boolean;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type ProductWorkflow = 'retail' | 'house_brand';

export interface ReportSection {
  id: string;
  key: string;
  label: string;
  description?: string;
  schema_json: Record<string, unknown>;
  ui_renderer_key: string;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ReportDefinitionSection {
  id: string;
  report_section_id: string;
  position: number;
  report_section: ReportSection;
}

export interface ReportDefinition {
  id: string;
  key: string;
  name: string;
  description?: string;
  version: number;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  sections: ReportDefinitionSection[];
}

export interface ReportDefinitionSnapshotSection {
  id: string;
  key: string;
  label: string;
  description?: string;
  schema_json: Record<string, unknown>;
  ui_renderer_key: string;
  position: number;
}

export interface ReportDefinitionSnapshot {
  id: string;
  key: string;
  name: string;
  description?: string;
  version: number;
  sections: ReportDefinitionSnapshotSection[];
}

export interface ReportType {
  id: string;
  key: string;
  label: string;
  description?: string;
  workflow: ProductWorkflow | string;
  icon?: string;
  default_prompt_id?: string;
  report_definition_id?: string;
  report_definition?: ReportDefinition;
  requires_competitor_verification: boolean;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Job {
  id: string;
  customer_id: string;
  prompt_id: string;
  model_id: string;
  report_type_id?: string;
  report_definition_id?: string;
  report_definition_version?: number;
  report_definition_snapshot?: ReportDefinitionSnapshot;
  report_parse_warnings?: string[];
  input_url: string;
  pdp_data?: Record<string, unknown>;
  competitor_verification?: Record<string, unknown>;
  prompt_rendered?: string;
  output?: string;
  output_tokens?: number;
  input_tokens?: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error?: string;
  duration_ms?: number;
  created_at: string;
  completed_at?: string;
  customer?: Customer;
  prompt?: Prompt;
  model?: AIModel;
  report_type?: ReportType;
  report_definition?: ReportDefinition;
}

export interface JobCreate {
  customer_id: string;
  prompt_id: string;
  model_id: string;
  input_url: string;
  report_type_id?: string;
  /** Omit/null ⇒ inherit from the report type's `requires_competitor_verification`. */
  verify_competitors?: boolean | null;
  /** Optional subset of verified competitors to include in prompt context. */
  selected_competitor_urls?: string[] | null;
}

export interface VerifiedCompetitorOption {
  url: string;
  title?: string;
  price?: string;
  reason: string;
  match_rate: number;
  snippet?: string;
  scrape_source?: string;
}

export interface CompetitorVerifyCreate {
  input_url: string;
  report_type_id?: string;
  verify_competitors?: boolean | null;
}

export interface CompetitorVerifyResult {
  verification_enabled: boolean;
  verification_run: boolean;
  skipped: boolean;
  skip_reason?: string;
  summary_message: string;
  total_candidates: number;
  total_verified: number;
  options: VerifiedCompetitorOption[];
  competitor_audit?: Record<string, unknown>;
}

export type SSEEvent =
  | { type: 'status'; message: string }
  | { type: 'warning'; message: string }
  | { type: 'token'; content: string }
  | { type: 'error'; message: string }
  | { type: 'done'; job_id: string; duration_ms: number };
