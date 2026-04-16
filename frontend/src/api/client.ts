import type {
  Customer, Prompt, AIModel, Job, JobCreate, SSEEvent,
} from './types';

const BASE = 'http://localhost:8000/api';

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Customers ─────────────────────────────────────────────────────────────────

export const api = {
  customers: {
    list: () => req<Customer[]>('/customers/'),
    get: (id: string) => req<Customer>(`/customers/${id}`),
    create: (body: Omit<Customer, 'id' | 'created_at' | 'updated_at'>) =>
      req<Customer>('/customers/', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: Partial<Customer>) =>
      req<Customer>(`/customers/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id: string) =>
      req<{ ok: boolean }>(`/customers/${id}`, { method: 'DELETE' }),
  },

  // ── Prompts ─────────────────────────────────────────────────────────────────
  prompts: {
    list: (customerId?: string) => {
      const params = customerId ? `?customer_id=${customerId}` : '';
      return req<Prompt[]>(`/prompts/${params}`);
    },
    get: (id: string) => req<Prompt>(`/prompts/${id}`),
    create: (body: Omit<Prompt, 'id' | 'version' | 'created_at' | 'updated_at'>) =>
      req<Prompt>('/prompts/', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: Partial<Prompt>) =>
      req<Prompt>(`/prompts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id: string) =>
      req<{ ok: boolean }>(`/prompts/${id}`, { method: 'DELETE' }),
  },

  // ── Models ───────────────────────────────────────────────────────────────────
  models: {
    list: () => req<AIModel[]>('/models/'),
    listAll: () => req<AIModel[]>('/models/all'),
    get: (id: string) => req<AIModel>(`/models/${id}`),
    create: (body: Omit<AIModel, 'id' | 'created_at' | 'updated_at'>) =>
      req<AIModel>('/models/', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: Partial<AIModel>) =>
      req<AIModel>(`/models/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id: string) =>
      req<{ ok: boolean }>(`/models/${id}`, { method: 'DELETE' }),
  },

  // ── Jobs ──────────────────────────────────────────────────────────────────────
  jobs: {
    list: (customerId?: string, limit = 50) => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (customerId) params.set('customer_id', customerId);
      return req<Job[]>(`/jobs/?${params}`);
    },
    get: (id: string) => req<Job>(`/jobs/${id}`),
    delete: (id: string) =>
      req<{ ok: boolean }>(`/jobs/${id}`, { method: 'DELETE' }),

    /**
     * Stream a job run via SSE.
     * Calls onEvent for each parsed event; returns when done or errors.
     */
    run: async (
      body: JobCreate,
      onEvent: (event: SSEEvent) => void,
      signal?: AbortSignal,
    ): Promise<void> => {
      const res = await fetch(`${BASE}/jobs/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail ?? `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data:')) continue;
          const json = line.slice(5).trim();
          try {
            const event = JSON.parse(json) as SSEEvent;
            onEvent(event);
          } catch {
            // skip malformed
          }
        }
      }
    },
  },
};
