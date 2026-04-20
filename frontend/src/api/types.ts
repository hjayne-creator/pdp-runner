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

export interface OutputFormat {
  id: string;
  key: string;
  label: string;
  description?: string;
  contract: string;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ReportType {
  id: string;
  key: string;
  label: string;
  description?: string;
  workflow: ProductWorkflow | string;
  icon?: string;
  default_prompt_id?: string;
  output_format_id?: string;
  output_format?: OutputFormat;
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
}

export interface JobCreate {
  customer_id: string;
  prompt_id: string;
  model_id: string;
  input_url: string;
  report_type_id?: string;
  /** Omit/null ⇒ inherit from the report type's `requires_competitor_verification`. */
  verify_competitors?: boolean | null;
}

export type SSEEvent =
  | { type: 'status'; message: string }
  | { type: 'warning'; message: string }
  | { type: 'token'; content: string }
  | { type: 'error'; message: string }
  | { type: 'done'; job_id: string; duration_ms: number };
