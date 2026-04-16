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

export interface Job {
  id: string;
  customer_id: string;
  prompt_id: string;
  model_id: string;
  input_url: string;
  pdp_data?: Record<string, unknown>;
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
}

export interface JobCreate {
  customer_id: string;
  prompt_id: string;
  model_id: string;
  input_url: string;
}

export type SSEEvent =
  | { type: 'status'; message: string }
  | { type: 'warning'; message: string }
  | { type: 'token'; content: string }
  | { type: 'error'; message: string }
  | { type: 'done'; job_id: string; duration_ms: number };
