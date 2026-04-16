import { useState, useEffect, useCallback } from 'react';
import {
  Settings, Users, FileText, Cpu, Plus, Pencil, Trash2,
  ChevronDown, ChevronUp, Tag, Loader2, AlertCircle, CheckCircle2,
} from 'lucide-react';
import { clsx } from 'clsx';
import { api } from '../api/client';
import type { Customer, Prompt, AIModel } from '../api/types';
import { Modal } from '../components/Modal';

// ── Toast ─────────────────────────────────────────────────────────────────────

type ToastType = 'success' | 'error';
interface Toast { id: number; type: ToastType; message: string }

function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  let nextId = 0;

  const show = useCallback((type: ToastType, message: string) => {
    const id = ++nextId;
    setToasts((t) => [...t, { id, type, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  return { toasts, show };
}

function ToastStack({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={clsx(
            'flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium animate-pulse',
            t.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white',
          )}
        >
          {t.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {t.message}
        </div>
      ))}
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({
  icon: Icon, title, count, action, children,
}: {
  icon: React.FC<{ className?: string }>;
  title: string;
  count?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-brand-600" />
          <h2 className="font-semibold text-gray-900">{title}</h2>
          {count !== undefined && (
            <span className="badge-gray text-xs">{count}</span>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

// ── Customers Admin ───────────────────────────────────────────────────────────

function CustomersSection({ toast }: { toast: (t: ToastType, m: string) => void }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState({ name: '', slug: '', description: '' });
  const [saving, setSaving] = useState(false);

  const reload = () => api.customers.list().then(setCustomers).finally(() => setLoading(false));
  useEffect(() => { reload(); }, []);

  const openCreate = () => { setEditing(null); setForm({ name: '', slug: '', description: '' }); setOpen(true); };
  const openEdit = (c: Customer) => {
    setEditing(c);
    setForm({ name: c.name, slug: c.slug, description: c.description ?? '' });
    setOpen(true);
  };

  const autoSlug = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const handleSave = async () => {
    if (!form.name || !form.slug) return;
    setSaving(true);
    try {
      if (editing) {
        await api.customers.update(editing.id, form);
        toast('success', 'Customer updated');
      } else {
        await api.customers.create({ ...form, active: true });
        toast('success', 'Customer created');
      }
      setOpen(false);
      reload();
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Error saving customer');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this customer and all its prompts?')) return;
    try {
      await api.customers.delete(id);
      toast('success', 'Customer deleted');
      reload();
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Error deleting customer');
    }
  };

  return (
    <>
      <Section
        icon={Users}
        title="Customers"
        count={customers.length}
        action={
          <button onClick={openCreate} className="btn-primary text-xs py-1.5 px-3">
            <Plus className="w-3.5 h-3.5" /> Add Customer
          </button>
        }
      >
        {loading ? (
          <div className="py-8 flex justify-center text-gray-300"><Loader2 className="animate-spin" /></div>
        ) : customers.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">No customers yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {customers.map((c) => (
              <li key={c.id} className="flex items-center gap-4 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{c.name}</p>
                  <p className="text-xs text-gray-400 font-mono">{c.slug}</p>
                  {c.description && (
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{c.description}</p>
                  )}
                </div>
                <span className={c.active ? 'badge-green' : 'badge-gray'}>
                  {c.active ? 'Active' : 'Inactive'}
                </span>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(c)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(c.id)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit Customer' : 'New Customer'} size="sm">
        <div className="flex flex-col gap-4">
          <div>
            <label className="label">Name</label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => {
                const name = e.target.value;
                setForm((f) => ({ ...f, name, slug: editing ? f.slug : autoSlug(name) }));
              }}
              placeholder="Jameco Electronics"
            />
          </div>
          <div>
            <label className="label">Slug</label>
            <input
              className="input font-mono"
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              placeholder="jameco-electronics"
            />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea
              className="input min-h-[80px] resize-none"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Short description…"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={handleSave} disabled={saving || !form.name || !form.slug} className="btn-primary flex-1 justify-center">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {editing ? 'Save Changes' : 'Create Customer'}
            </button>
            <button onClick={() => setOpen(false)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      </Modal>
    </>
  );
}

// ── Prompts Admin ─────────────────────────────────────────────────────────────

function PromptsSection({ toast }: { toast: (t: ToastType, m: string) => void }) {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Prompt | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState({
    customer_id: '', name: '', description: '', content: '', tags: '',
  });
  const [saving, setSaving] = useState(false);

  const reload = () => {
    Promise.all([
      api.prompts.list(undefined),
      api.customers.list(),
    ]).then(([ps, cs]) => { setPrompts(ps); setCustomers(cs); }).finally(() => setLoading(false));
  };
  useEffect(() => { reload(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ customer_id: customers[0]?.id ?? '', name: '', description: '', content: '', tags: '' });
    setOpen(true);
  };
  const openEdit = (p: Prompt) => {
    setEditing(p);
    setForm({
      customer_id: p.customer_id,
      name: p.name,
      description: p.description ?? '',
      content: p.content,
      tags: p.tags.join(', '),
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.customer_id || !form.content) return;
    setSaving(true);
    const tags = form.tags.split(',').map((t) => t.trim()).filter(Boolean);
    try {
      if (editing) {
        await api.prompts.update(editing.id, { ...form, tags });
        toast('success', 'Prompt updated (version bumped)');
      } else {
        await api.prompts.create({ ...form, tags, active: true });
        toast('success', 'Prompt created');
      }
      setOpen(false);
      reload();
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Error saving prompt');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this prompt?')) return;
    try {
      await api.prompts.delete(id);
      toast('success', 'Prompt deleted');
      reload();
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Error deleting prompt');
    }
  };

  const customerMap = Object.fromEntries(customers.map((c) => [c.id, c.name]));

  return (
    <>
      <Section
        icon={FileText}
        title="Prompts"
        count={prompts.length}
        action={
          <button onClick={openCreate} className="btn-primary text-xs py-1.5 px-3">
            <Plus className="w-3.5 h-3.5" /> New Prompt
          </button>
        }
      >
        {loading ? (
          <div className="py-8 flex justify-center text-gray-300"><Loader2 className="animate-spin" /></div>
        ) : prompts.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">No prompts yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {prompts.map((p) => (
              <li key={p.id} className="px-5 py-3">
                <div className="flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-gray-900">{p.name}</p>
                      <span className="badge-gray text-xs">v{p.version}</span>
                      <span className="badge-blue text-xs">{customerMap[p.customer_id] ?? p.customer_id}</span>
                    </div>
                    {p.description && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{p.description}</p>
                    )}
                    {p.tags.length > 0 && (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {p.tags.map((tag) => (
                          <span key={tag} className="badge-gray text-xs flex items-center gap-0.5">
                            <Tag className="w-2.5 h-2.5" />{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                      className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700"
                      title="Preview"
                    >
                      {expanded === p.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={() => openEdit(p)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDelete(p.id)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {expanded === p.id && (
                  <pre className="mt-3 text-xs font-mono text-gray-600 whitespace-pre-wrap bg-gray-50 rounded-lg p-3 max-h-48 overflow-y-auto border border-gray-100">
                    {p.content}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit Prompt' : 'New Prompt'} size="xl">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Customer</label>
              <select
                className="select"
                value={form.customer_id}
                onChange={(e) => setForm((f) => ({ ...f, customer_id: e.target.value }))}
              >
                <option value="">Select customer…</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Name</label>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Jameco PDP Audit"
              />
            </div>
          </div>

          <div>
            <label className="label">Description</label>
            <input
              className="input"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Short description of what this prompt does"
            />
          </div>

          <div>
            <label className="label">Tags (comma-separated)</label>
            <input
              className="input"
              value={form.tags}
              onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
              placeholder="audit, pdp, enrichment"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="label mb-0">Prompt Content</label>
              <span className="text-xs text-gray-400">
                {form.content.length.toLocaleString()} chars
              </span>
            </div>
            <p className="text-xs text-gray-400 mb-2">
              Use <code className="bg-gray-100 px-1 rounded">{'{{JAMECO_URL}}'}</code>,{' '}
              <code className="bg-gray-100 px-1 rounded">{'{{PDP_DATA}}'}</code>, or{' '}
              <code className="bg-gray-100 px-1 rounded">{'{{URL}}'}</code> as placeholders.
            </p>
            <textarea
              className="input font-mono text-xs leading-relaxed resize-y"
              rows={16}
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              placeholder="You are a senior eCommerce content editor…"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={handleSave}
              disabled={saving || !form.name || !form.customer_id || !form.content}
              className="btn-primary flex-1 justify-center"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {editing ? 'Save Changes' : 'Create Prompt'}
            </button>
            <button onClick={() => setOpen(false)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      </Modal>
    </>
  );
}

// ── Models Admin ──────────────────────────────────────────────────────────────

const PROVIDERS = ['openai', 'anthropic', 'other'];

function ModelsSection({ toast }: { toast: (t: ToastType, m: string) => void }) {
  const [models, setModels] = useState<AIModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AIModel | null>(null);
  const [form, setForm] = useState({
    name: '', display_name: '', provider: 'openai', model_id: '',
    description: '', max_tokens: 8192,
  });
  const [saving, setSaving] = useState(false);

  const reload = () => api.models.listAll().then(setModels).finally(() => setLoading(false));
  useEffect(() => { reload(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', display_name: '', provider: 'openai', model_id: '', description: '', max_tokens: 8192 });
    setOpen(true);
  };
  const openEdit = (m: AIModel) => {
    setEditing(m);
    setForm({
      name: m.name, display_name: m.display_name, provider: m.provider,
      model_id: m.model_id, description: m.description ?? '', max_tokens: m.max_tokens,
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.model_id) return;
    setSaving(true);
    try {
      if (editing) {
        await api.models.update(editing.id, form);
        toast('success', 'Model updated');
      } else {
        await api.models.create({ ...form, supports_streaming: true, active: true, config: {} });
        toast('success', 'Model added');
      }
      setOpen(false);
      reload();
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Error saving model');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this model?')) return;
    try {
      await api.models.delete(id);
      toast('success', 'Model removed');
      reload();
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Error deleting model');
    }
  };

  const providerBadge = (p: string) => {
    if (p === 'openai') return <span className="badge-green text-xs">OpenAI</span>;
    if (p === 'anthropic') return <span className="badge-blue text-xs">Anthropic</span>;
    return <span className="badge-gray text-xs">{p}</span>;
  };

  return (
    <>
      <Section
        icon={Cpu}
        title="AI Models"
        count={models.length}
        action={
          <button onClick={openCreate} className="btn-primary text-xs py-1.5 px-3">
            <Plus className="w-3.5 h-3.5" /> Add Model
          </button>
        }
      >
        {loading ? (
          <div className="py-8 flex justify-center text-gray-300"><Loader2 className="animate-spin" /></div>
        ) : models.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">No models configured.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {models.map((m) => (
              <li key={m.id} className="flex items-center gap-4 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-gray-900">{m.display_name}</p>
                    {providerBadge(m.provider)}
                    {!m.active && <span className="badge-gray text-xs">Inactive</span>}
                  </div>
                  <p className="text-xs font-mono text-gray-400 mt-0.5">{m.model_id}</p>
                  {m.description && (
                    <p className="text-xs text-gray-500 mt-0.5">{m.description}</p>
                  )}
                </div>
                <div className="text-xs text-gray-400 shrink-0">{m.max_tokens.toLocaleString()} max tokens</div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => openEdit(m)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(m.id)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit Model' : 'Add AI Model'} size="md">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Display Name</label>
              <input className="input" value={form.display_name}
                onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
                placeholder="GPT (5.2)" />
            </div>
            <div>
              <label className="label">Internal Name</label>
              <input className="input font-mono" value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="gpt-5-2" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Provider</label>
              <select className="select" value={form.provider}
                onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}>
                {PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Model ID</label>
              <input className="input font-mono" value={form.model_id}
                onChange={(e) => setForm((f) => ({ ...f, model_id: e.target.value }))}
                placeholder="gpt-4o / claude-opus-4-5" />
            </div>
          </div>
          <div>
            <label className="label">Description</label>
            <input className="input" value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Short description" />
          </div>
          <div>
            <label className="label">Max Output Tokens</label>
            <input type="number" className="input" value={form.max_tokens}
              onChange={(e) => setForm((f) => ({ ...f, max_tokens: parseInt(e.target.value) || 8192 }))} />
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={handleSave} disabled={saving || !form.name || !form.model_id} className="btn-primary flex-1 justify-center">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {editing ? 'Save Changes' : 'Add Model'}
            </button>
            <button onClick={() => setOpen(false)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      </Modal>
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function AdminPage() {
  const { toasts, show: toast } = useToast();

  return (
    <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center gap-3 mb-6">
        <Settings className="w-5 h-5 text-brand-600" />
        <h1 className="text-xl font-semibold text-gray-900">Admin</h1>
      </div>

      <div className="flex flex-col gap-6">
        <CustomersSection toast={toast} />
        <PromptsSection toast={toast} />
        <ModelsSection toast={toast} />
      </div>

      <ToastStack toasts={toasts} />
    </div>
  );
}
