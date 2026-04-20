import { useState, useEffect, useCallback } from 'react';
import {
  Settings, FileText, Cpu, Plus, Pencil, Trash2,
  ChevronDown, ChevronUp, Loader2, AlertCircle, CheckCircle2, FileJson, FileCode2,
} from 'lucide-react';
import { clsx } from 'clsx';
import { api } from '../api/client';
import type { Prompt, AIModel, ReportType, OutputFormat } from '../api/types';
import { Modal } from '../components/Modal';
import { getRegisteredRendererTemplateIds } from '../utils/reportTemplates';

// ── Constants ────────────────────────────────────────────────────────────────

const WORKFLOW_OPTIONS: { value: string; label: string }[] = [
  { value: 'retail', label: 'Retail' },
  { value: 'house_brand', label: 'House brand' },
];

const ICON_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '— default —' },
  { value: 'Wand2', label: 'Wand (rewrite)' },
  { value: 'Users', label: 'Users (competitors)' },
  { value: 'Layers', label: 'Layers (combo)' },
  { value: 'Sparkles', label: 'Sparkles' },
];

/**
 * Output format keys recreated by the one-time retail bootstrap in ``seed.py``.
 * Used only for the delete confirmation copy (not the same as “has a renderer”).
 */
const SEED_BOOTSTRAP_OUTPUT_FORMAT_KEYS = [
  'pdp-ai-rewrite-v1',
  'pdp-gap-analysis-v1',
  'pdp-gap-analysis-rewrite-v1',
] as const;

function isRegisteredRendererKey(key: string): boolean {
  return getRegisteredRendererTemplateIds().includes(key);
}

// ── Toast ────────────────────────────────────────────────────────────────────

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

function isNotFound(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  return /not found/i.test(e.message) || /404/.test(e.message);
}

// ── Section wrapper ──────────────────────────────────────────────────────────

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

// ── Report Types Admin (just picks an OutputFormat now) ──────────────────────

interface ReportTypeForm {
  key: string;
  label: string;
  description: string;
  workflow: string;
  icon: string;
  default_prompt_id: string;
  output_format_id: string;
  requires_competitor_verification: boolean;
  active: boolean;
  sort_order: number;
}

const EMPTY_REPORT_TYPE: ReportTypeForm = {
  key: '',
  label: '',
  description: '',
  workflow: 'retail',
  icon: '',
  default_prompt_id: '',
  output_format_id: '',
  requires_competitor_verification: false,
  active: true,
  sort_order: 100,
};

function ReportTypesSection({ toast }: { toast: (t: ToastType, m: string) => void }) {
  const [types, setTypes] = useState<ReportType[]>([]);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [formats, setFormats] = useState<OutputFormat[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ReportType | null>(null);
  const [form, setForm] = useState<ReportTypeForm>(EMPTY_REPORT_TYPE);
  const [saving, setSaving] = useState(false);

  const reload = () => {
    setLoading(true);
    Promise.all([
      api.reportTypes.list({ activeOnly: false }),
      api.prompts.list(),
      api.outputFormats.list(),
    ])
      .then(([rts, ps, fs]) => {
        setTypes(rts);
        setPrompts(ps);
        setFormats(fs);
      })
      .catch((e) => toast('error', e instanceof Error ? e.message : 'Could not load report types'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({
      ...EMPTY_REPORT_TYPE,
      output_format_id: formats[0]?.id ?? '',
    });
    setOpen(true);
  };

  const openEdit = (rt: ReportType) => {
    setEditing(rt);
    setForm({
      key: rt.key,
      label: rt.label,
      description: rt.description ?? '',
      workflow: rt.workflow,
      icon: rt.icon ?? '',
      default_prompt_id: rt.default_prompt_id ?? '',
      output_format_id: rt.output_format_id ?? '',
      requires_competitor_verification: rt.requires_competitor_verification,
      active: rt.active,
      sort_order: rt.sort_order,
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.key || !form.label) return;
    setSaving(true);
    const payload = {
      key: form.key,
      label: form.label,
      description: form.description,
      workflow: form.workflow,
      icon: form.icon || undefined,
      default_prompt_id: form.default_prompt_id || undefined,
      output_format_id: form.output_format_id || undefined,
      requires_competitor_verification: form.requires_competitor_verification,
      active: form.active,
      sort_order: form.sort_order,
    };
    try {
      if (editing) {
        await api.reportTypes.update(editing.id, payload);
        toast('success', 'Report type updated');
      } else {
        await api.reportTypes.create(payload);
        toast('success', 'Report type created');
      }
      setOpen(false);
      reload();
    } catch (e: unknown) {
      if (isNotFound(e)) {
        toast('error', 'That report type no longer exists. Refreshing.');
        setOpen(false);
        reload();
      } else {
        toast('error', e instanceof Error ? e.message : 'Error saving report type');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (rt: ReportType) => {
    if (!confirm(`Delete "${rt.label}"? Existing jobs keep their record but new runs will need a different report type.`)) return;
    try {
      await api.reportTypes.delete(rt.id);
      toast('success', 'Report type deleted');
    } catch (e: unknown) {
      if (isNotFound(e)) {
        toast('error', 'Already gone — refreshing.');
      } else {
        toast('error', e instanceof Error ? e.message : 'Error deleting report type');
      }
    } finally {
      reload();
    }
  };

  const promptName = (id?: string) => {
    if (!id) return 'No default';
    const found = prompts.find((p) => p.id === id);
    return found ? found.name : '⚠ missing prompt';
  };

  const formatLabel = (id?: string) => {
    if (!id) return '⚠ none';
    const found = formats.find((f) => f.id === id);
    return found ? found.label : '⚠ missing format';
  };

  return (
    <>
      <Section
        icon={FileJson}
        title="Report Types"
        count={types.length}
        action={
          <button onClick={openCreate} className="btn-primary text-xs py-1.5 px-3">
            <Plus className="w-3.5 h-3.5" /> New Report Type
          </button>
        }
      >
        {loading ? (
          <div className="py-8 flex justify-center text-gray-300"><Loader2 className="animate-spin" /></div>
        ) : types.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">No report types configured.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {types.map((rt) => (
              <li key={rt.id} className="flex items-center gap-4 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-gray-900">{rt.label}</p>
                    <span className={rt.active ? 'badge-green text-xs' : 'badge-gray text-xs'}>
                      {rt.active ? 'Active' : 'Inactive'}
                    </span>
                    <span className="badge-blue text-xs">{rt.workflow}</span>
                    {rt.requires_competitor_verification && (
                      <span className="badge-gray text-xs">competitor</span>
                    )}
                  </div>
                  <p className="text-xs font-mono text-gray-400 mt-0.5">{rt.key}</p>
                  {rt.description && (
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{rt.description}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-0.5">
                    Default prompt: <span className="text-gray-600">{promptName(rt.default_prompt_id)}</span>
                    <span className="mx-1.5">·</span>
                    Output format: <span className="text-gray-600">{formatLabel(rt.output_format_id)}</span>
                  </p>
                </div>
                <span className="text-xs text-gray-400">Order: {rt.sort_order}</span>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(rt)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(rt)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit Report Type' : 'New Report Type'} size="lg">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Key</label>
              <input
                className="input font-mono"
                value={form.key}
                onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
                placeholder="retail-rewrite"
              />
            </div>
            <div>
              <label className="label">Label</label>
              <input
                className="input"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="PDP AI rewrite"
              />
            </div>
          </div>
          <div>
            <label className="label">Description</label>
            <input
              className="input"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Hint shown on the homepage card"
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">Workflow</label>
              <select
                className="select"
                value={form.workflow}
                onChange={(e) => setForm((f) => ({ ...f, workflow: e.target.value }))}
              >
                {WORKFLOW_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Icon</label>
              <select
                className="select"
                value={form.icon}
                onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
              >
                {ICON_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Sort Order</label>
              <input
                type="number"
                className="input"
                value={form.sort_order}
                onChange={(e) => setForm((f) => ({ ...f, sort_order: parseInt(e.target.value) || 100 }))}
              />
            </div>
          </div>
          <div>
            <label className="label">Default Prompt</label>
            <select
              className="select"
              value={form.default_prompt_id}
              onChange={(e) => setForm((f) => ({ ...f, default_prompt_id: e.target.value }))}
            >
              <option value="">— none —</option>
              {prompts.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              {prompts.length === 0
                ? 'No prompts exist yet. Create one in Prompts below, then come back to wire it up.'
                : 'The prompt the homepage will hand to the runner when this report type is picked.'}
            </p>
          </div>
          <div>
            <label className="label">Output format</label>
            <select
              className="select"
              value={form.output_format_id}
              onChange={(e) => setForm((f) => ({ ...f, output_format_id: e.target.value }))}
            >
              <option value="">— none —</option>
              {formats.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}{f.active ? '' : ' (inactive)'}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              {formats.length === 0
                ? 'No output formats exist yet. Create one in Output Formats below.'
                : 'Defines both the JSON contract (sent to the AI) and the renderer used to display the result. Manage in Output Formats below.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
              />
              Active
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.requires_competitor_verification}
                onChange={(e) => setForm((f) => ({ ...f, requires_competitor_verification: e.target.checked }))}
              />
              Requires competitor verification
            </label>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleSave}
              disabled={saving || !form.key || !form.label}
              className="btn-primary flex-1 justify-center"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {editing ? 'Save Changes' : 'Create Report Type'}
            </button>
            <button onClick={() => setOpen(false)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      </Modal>
    </>
  );
}

// ── Output Formats Admin ─────────────────────────────────────────────────────

interface OutputFormatForm {
  key: string;
  label: string;
  description: string;
  contract: string;
  active: boolean;
  sort_order: number;
}

const EMPTY_FORMAT: OutputFormatForm = {
  key: '',
  label: '',
  description: '',
  contract: '',
  active: true,
  sort_order: 100,
};

function OutputFormatsSection({ toast }: { toast: (t: ToastType, m: string) => void }) {
  const [formats, setFormats] = useState<OutputFormat[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<OutputFormat | null>(null);
  const [form, setForm] = useState<OutputFormatForm>(EMPTY_FORMAT);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const reload = () => {
    setLoading(true);
    api.outputFormats.list()
      .then(setFormats)
      .catch((e) => toast('error', e instanceof Error ? e.message : 'Could not load output formats'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORMAT });
    setOpen(true);
  };

  const openEdit = (f: OutputFormat) => {
    setEditing(f);
    setForm({
      key: f.key,
      label: f.label,
      description: f.description ?? '',
      contract: f.contract,
      active: f.active,
      sort_order: f.sort_order,
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.key || !form.label || !form.contract) return;
    setSaving(true);
    try {
      if (editing) {
        await api.outputFormats.update(editing.id, form);
        toast('success', 'Output format updated');
      } else {
        await api.outputFormats.create(form);
        toast('success', 'Output format created');
      }
      setOpen(false);
      reload();
    } catch (e: unknown) {
      if (isNotFound(e)) {
        toast('error', 'That output format no longer exists. Refreshing.');
        setOpen(false);
        reload();
      } else {
        toast('error', e instanceof Error ? e.message : 'Error saving output format');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (f: OutputFormat) => {
    const builtIn = (SEED_BOOTSTRAP_OUTPUT_FORMAT_KEYS as readonly string[]).includes(f.key);
    const msg = builtIn
      ? `Delete built-in format "${f.label}"? It will be re-created on the next backend startup. Any report types using it will lose their format link until you reassign.`
      : `Delete "${f.label}"? Any report types using it will lose their format link.`;
    if (!confirm(msg)) return;
    try {
      await api.outputFormats.delete(f.id);
      toast('success', 'Output format deleted');
    } catch (e: unknown) {
      if (isNotFound(e)) {
        toast('error', 'Already gone — refreshing.');
      } else {
        toast('error', e instanceof Error ? e.message : 'Error deleting output format');
      }
    } finally {
      reload();
    }
  };

  return (
    <>
      <Section
        icon={FileCode2}
        title="Output Formats"
        count={formats.length}
        action={
          <button onClick={openCreate} className="btn-primary text-xs py-1.5 px-3">
            <Plus className="w-3.5 h-3.5" /> New Output Format
          </button>
        }
      >
        {loading ? (
          <div className="py-8 flex justify-center text-gray-300"><Loader2 className="animate-spin" /></div>
        ) : formats.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">No output formats configured.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {formats.map((f) => {
              const isKnown = isRegisteredRendererKey(f.key);
              return (
                <li key={f.id} className="px-5 py-3">
                  <div className="flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-gray-900">{f.label}</p>
                        <span className={f.active ? 'badge-green text-xs' : 'badge-gray text-xs'}>
                          {f.active ? 'Active' : 'Inactive'}
                        </span>
                        {isKnown ? (
                          <span className="badge-blue text-xs" title="A frontend renderer is registered for this key">
                            Renderer ✓
                          </span>
                        ) : (
                          <span className="badge-gray text-xs" title="No frontend renderer for this key — output will display as raw JSON">
                            Raw JSON
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-mono text-gray-400 mt-0.5">{f.key}</p>
                      {f.description && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate">{f.description}</p>
                      )}
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">Order: {f.sort_order}</span>
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => setExpanded(expanded === f.id ? null : f.id)}
                        className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700"
                        title="Preview contract"
                      >
                        {expanded === f.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={() => openEdit(f)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(f)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {expanded === f.id && (
                    <pre className="mt-3 text-xs font-mono text-gray-600 whitespace-pre-wrap bg-gray-50 rounded-lg p-3 max-h-60 overflow-y-auto border border-gray-100">
                      {f.contract}
                    </pre>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit Output Format' : 'New Output Format'} size="xl">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Key</label>
              <input
                className="input font-mono"
                value={form.key}
                onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
                placeholder="pdp-ai-rewrite-v1"
                disabled={editing != null && isRegisteredRendererKey(editing.key)}
              />
              <p className="text-xs text-gray-400 mt-1">
                Frontend renderer lookup. Registered:{' '}
                {getRegisteredRendererTemplateIds().map((k) => (
                  <code key={k} className="text-[11px] bg-gray-100 px-1 rounded mr-1">{k}</code>
                ))}
                Other keys render as raw JSON.
              </p>
            </div>
            <div>
              <label className="label">Label</label>
              <input
                className="input"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="PDP Audit (Detailed)"
              />
            </div>
          </div>
          <div>
            <label className="label">Description</label>
            <input
              className="input"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="What this format produces"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="label mb-0">Output contract</label>
              <span className="text-xs text-gray-400">{form.contract.length.toLocaleString()} chars</span>
            </div>
            <p className="text-xs text-gray-400 mb-2">
              JSON schema description embedded in the prompt as{' '}
              <code className="bg-gray-100 px-1 rounded">{'{{OUTPUT_CONTRACT}}'}</code>.
              Must match the JSON shape the registered renderer expects.
            </p>
            <textarea
              className="input font-mono text-xs leading-relaxed resize-y"
              rows={16}
              value={form.contract}
              onChange={(e) => setForm((f) => ({ ...f, contract: e.target.value }))}
              placeholder="=== OUTPUT CONTRACT ===&#10;Return ONLY valid JSON…"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Sort Order</label>
              <input
                type="number"
                className="input"
                value={form.sort_order}
                onChange={(e) => setForm((f) => ({ ...f, sort_order: parseInt(e.target.value) || 100 }))}
              />
            </div>
            <div className="flex items-end">
              <label className="inline-flex items-center gap-2 text-sm text-gray-700 pb-2">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                />
                Active
              </label>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleSave}
              disabled={saving || !form.key || !form.label || !form.contract}
              className="btn-primary flex-1 justify-center"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {editing ? 'Save Changes' : 'Create Output Format'}
            </button>
            <button onClick={() => setOpen(false)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      </Modal>
    </>
  );
}

// ── Prompts Admin (no tags UI; single-tenant assumed) ────────────────────────

function PromptsSection({ toast }: { toast: (t: ToastType, m: string) => void }) {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [tenantId, setTenantId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Prompt | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '', content: '' });
  const [saving, setSaving] = useState(false);

  const reload = () => {
    setLoading(true);
    Promise.all([api.prompts.list(undefined), api.customers.list()])
      .then(([ps, cs]) => {
        setPrompts(ps);
        setTenantId(cs[0]?.id ?? '');
      })
      .catch((e) => toast('error', e instanceof Error ? e.message : 'Could not load prompts'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', description: '', content: '' });
    setOpen(true);
  };
  const openEdit = (p: Prompt) => {
    setEditing(p);
    setForm({
      name: p.name,
      description: p.description ?? '',
      content: p.content,
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.content) return;
    setSaving(true);
    try {
      if (editing) {
        await api.prompts.update(editing.id, form);
        toast('success', 'Prompt updated (version bumped)');
      } else {
        if (!tenantId) {
          toast('error', 'No tenant available; cannot create prompt.');
          setSaving(false);
          return;
        }
        await api.prompts.create({ ...form, customer_id: tenantId, tags: [], active: true });
        toast('success', 'Prompt created');
      }
      setOpen(false);
      reload();
    } catch (e: unknown) {
      if (isNotFound(e)) {
        toast('error', 'That prompt no longer exists. Refreshing.');
        setOpen(false);
        reload();
      } else {
        toast('error', e instanceof Error ? e.message : 'Error saving prompt');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (p: Prompt) => {
    if (!confirm(`Delete "${p.name}"? Any report types using it as default will be left unset.`)) return;
    try {
      await api.prompts.delete(p.id);
      toast('success', 'Prompt deleted');
    } catch (e: unknown) {
      if (isNotFound(e)) {
        toast('error', 'Already gone — refreshing.');
      } else {
        toast('error', e instanceof Error ? e.message : 'Error deleting prompt');
      }
    } finally {
      reload();
    }
  };

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
                    </div>
                    {p.description && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{p.description}</p>
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
                    <button onClick={() => handleDelete(p)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500">
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
          <div>
            <label className="label">Name</label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Retail — competitor analysis"
            />
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
            <div className="flex items-center justify-between mb-1.5">
              <label className="label mb-0">Prompt Content</label>
              <span className="text-xs text-gray-400">
                {form.content.length.toLocaleString()} chars
              </span>
            </div>
            <p className="text-xs text-gray-400 mb-2">
              Use <code className="bg-gray-100 px-1 rounded">{'{{URL}}'}</code>,{' '}
              <code className="bg-gray-100 px-1 rounded">{'{{PDP_DATA}}'}</code>,{' '}
              <code className="bg-gray-100 px-1 rounded">{'{{VERIFIED_COMPETITOR_CONTEXT}}'}</code>,
              and <code className="bg-gray-100 px-1 rounded">{'{{OUTPUT_CONTRACT}}'}</code> as placeholders.
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
              disabled={saving || !form.name || !form.content}
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

// ── Models Admin (unchanged) ─────────────────────────────────────────────────

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

  const reload = () => {
    setLoading(true);
    api.models.listAll()
      .then(setModels)
      .catch((e) => toast('error', e instanceof Error ? e.message : 'Could not load models'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

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
      if (isNotFound(e)) {
        toast('error', 'That model no longer exists. Refreshing.');
        setOpen(false);
        reload();
      } else {
        toast('error', e instanceof Error ? e.message : 'Error saving model');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (m: AIModel) => {
    if (!confirm(`Remove "${m.display_name}"?`)) return;
    try {
      await api.models.delete(m.id);
      toast('success', 'Model removed');
    } catch (e: unknown) {
      if (isNotFound(e)) {
        toast('error', 'Already gone — refreshing.');
      } else {
        toast('error', e instanceof Error ? e.message : 'Error deleting model');
      }
    } finally {
      reload();
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
                  <button onClick={() => handleDelete(m)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500">
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

// ── Page ─────────────────────────────────────────────────────────────────────

export function AdminPage() {
  const { toasts, show: toast } = useToast();

  return (
    <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center gap-3 mb-6">
        <Settings className="w-5 h-5 text-brand-600" />
        <h1 className="text-xl font-semibold text-gray-900">Admin</h1>
      </div>

      <div className="flex flex-col gap-6">
        <ReportTypesSection toast={toast} />
        <OutputFormatsSection toast={toast} />
        <PromptsSection toast={toast} />
        <ModelsSection toast={toast} />
      </div>

      <ToastStack toasts={toasts} />
    </div>
  );
}
