import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Globe,
  Layers,
  Loader2,
  Lock,
  Sparkles,
  Users,
  Wand2,
} from 'lucide-react';
import { clsx } from 'clsx';
import { api } from '../api/client';
import type { AIModel, ProductWorkflow, ReportType } from '../api/types';
import type { HomeToRunnerIntent, RunnerPrefillState } from '../utils/workflow';

const ICON_REGISTRY: Record<string, typeof Wand2> = {
  Wand2,
  Users,
  Layers,
  Sparkles,
};

function iconFor(name?: string): typeof Wand2 {
  if (name && ICON_REGISTRY[name]) return ICON_REGISTRY[name];
  return Sparkles;
}

function StepBadge({ n, done }: { n: number; done: boolean }) {
  return (
    <span
      className={clsx(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
        done ? 'bg-brand-600 text-white' : 'bg-gray-200 text-gray-600',
      )}
    >
      {done ? '✓' : n}
    </span>
  );
}

export function HomePage() {
  const navigate = useNavigate();
  const [url, setUrl] = useState('');
  const [productKind, setProductKind] = useState<ProductWorkflow>('retail');
  const [reportTypeId, setReportTypeId] = useState<string | null>(null);
  const [modelId, setModelId] = useState('');
  const [optionalOpen, setOptionalOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  const [models, setModels] = useState<AIModel[]>([]);
  const [reportTypes, setReportTypes] = useState<ReportType[]>([]);
  const [configLoading, setConfigLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setConfigLoading(true);
      setConfigError(null);
      try {
        const [typeList, modelList] = await Promise.all([
          api.reportTypes.list({ activeOnly: true }),
          api.models.list(),
        ]);
        if (cancelled) return;
        setModels(modelList);
        setReportTypes(typeList);
        if (modelList.length && !modelId) {
          setModelId(modelList[0].id);
        }
      } catch (e) {
        if (!cancelled) {
          setConfigError(e instanceof Error ? e.message : 'Could not load configuration.');
        }
      } finally {
        if (!cancelled) setConfigLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial defaults only
  }, []);

  useEffect(() => {
    if (models.length === 0) return;
    if (!modelId || !models.some((m) => m.id === modelId)) {
      setModelId(models[0].id);
    }
  }, [models, modelId]);

  const reportTypesForWorkflow = useMemo(
    () => reportTypes.filter((rt) => rt.workflow === productKind),
    [reportTypes, productKind],
  );

  // If the active workflow doesn't include the currently-selected report type, clear it.
  useEffect(() => {
    if (!reportTypeId) return;
    const stillVisible = reportTypesForWorkflow.some((rt) => rt.id === reportTypeId);
    if (!stillVisible) setReportTypeId(null);
  }, [reportTypesForWorkflow, reportTypeId]);

  const urlLooksValid = useMemo(() => {
    const t = url.trim();
    if (!t) return false;
    try {
      const u = new URL(t.startsWith('http') ? t : `https://${t}`);
      return Boolean(u.hostname);
    } catch {
      return false;
    }
  }, [url]);

  const selectedReportType = reportTypes.find((rt) => rt.id === reportTypeId) ?? null;

  const goToRunner = (homeIntent: HomeToRunnerIntent) => {
    setSubmitted(true);
    if (!urlLooksValid || productKind !== 'retail' || !selectedReportType) return;
    if (!selectedReportType.default_prompt_id) {
      setConfigError(
        `'${selectedReportType.label}' has no default prompt configured. Set one in Admin → Report Types.`,
      );
      return;
    }
    if (!modelId) {
      setConfigError('Select an AI model.');
      return;
    }
    setConfigError(null);
    const state: RunnerPrefillState = {
      fromHome: true,
      homeIntent,
      inputUrl: url.trim(),
      workflow: productKind,
      reportTypeId: selectedReportType.id,
      modelId,
      promptId: selectedReportType.default_prompt_id,
      verifyCompetitors: selectedReportType.requires_competitor_verification,
    };
    navigate('/run', { state });
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14 pb-24">
      <header className="mb-10 sm:mb-12">
        <p className="text-sm font-medium text-brand-600 mb-2">PDP Runner</p>
        <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900 tracking-tight">
          Analyze a product detail page
        </h1>
        <p className="mt-3 text-gray-600 text-sm sm:text-base leading-relaxed max-w-2xl">
          Welcome, let's get started.
        </p>
      </header>

      {configError && (
        <div
          className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
          role="alert"
        >
          {configError}
        </div>
      )}

      <ol className="space-y-10 sm:space-y-12">
        <li className="card p-5 sm:p-6">
          <div className="flex gap-4">
            <StepBadge n={1} done={urlLooksValid} />
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Product page URL</h2>
                </div>
                <Globe className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" aria-hidden />
              </div>
              <label className="label mt-5" htmlFor="pdp-url">
                URL
              </label>
              <input
                id="pdp-url"
                type="url"
                inputMode="url"
                autoComplete="url"
                placeholder="https://www.example.com/products/your-sku"
                className="input font-mono text-[13px]"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setSubmitted(false);
                }}
              />
              {url.trim() && !urlLooksValid ? (
                <p className="mt-2 text-xs text-amber-700">Enter a valid URL (https recommended).</p>
              ) : null}
            </div>
          </div>
        </li>

        <li className="card p-5 sm:p-6">
          <div className="flex gap-4">
            <StepBadge n={2} done={productKind === 'retail'} />
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-gray-900">What type of product is this?</h2>
              <p className="mt-1 text-sm text-gray-500">
                Workflows are separate; only retail is available today.
              </p>
              <div className="mt-5 grid sm:grid-cols-2 gap-3">
                <div
                  className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 text-left shadow-sm opacity-80"
                  aria-disabled="true"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-gray-500">House brand</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-600">
                      <Lock className="w-3 h-3" aria-hidden />
                      Coming soon
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-gray-500 leading-relaxed">
                    House brand label or private-label. This flow is not wired yet.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setProductKind('retail');
                    setSubmitted(false);
                  }}
                  className={clsx(
                    'text-left rounded-xl border px-4 py-4 transition shadow-sm',
                    productKind === 'retail'
                      ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50',
                  )}
                >
                  <span className="font-medium text-gray-900">Retail</span>
                  <span className="mt-1.5 block text-xs text-gray-600 leading-relaxed">
                    Third-party brands sold across multiple retailers.
                  </span>
                </button>
              </div>
            </div>
          </div>
        </li>

        <li className="card p-5 sm:p-6">
          <div className="flex gap-4">
            <StepBadge n={3} done={Boolean(reportTypeId)} />
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-gray-900">Pick a report type</h2>
              <p className="mt-1 text-sm text-gray-500">
                Each report type has a default prompt and output format. Manage them in
                Admin → Report Types.
              </p>
              {configLoading ? (
                <div className="mt-5 flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading report types…
                </div>
              ) : reportTypesForWorkflow.length === 0 ? (
                <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                  No active report types for this workflow. Create one in
                  Admin → Report Types.
                </div>
              ) : (
                <div className="mt-5 space-y-3">
                  {reportTypesForWorkflow.map((rt) => {
                    const selected = reportTypeId === rt.id;
                    const Icon = iconFor(rt.icon);
                    return (
                      <button
                        key={rt.id}
                        type="button"
                        onClick={() => {
                          setReportTypeId(rt.id);
                          setSubmitted(false);
                        }}
                        className={clsx(
                          'w-full text-left rounded-xl border px-4 py-4 flex gap-3 transition shadow-sm',
                          selected
                            ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200'
                            : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50',
                        )}
                      >
                        <span
                          className={clsx(
                            'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                            selected ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600',
                          )}
                        >
                          <Icon className="w-5 h-5" aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="font-medium text-gray-900 block">{rt.label}</span>
                          {rt.description ? (
                            <span className="mt-0.5 block text-xs text-gray-600 leading-relaxed">
                              {rt.description}
                            </span>
                          ) : null}
                          {!rt.default_prompt_id ? (
                            <span className="mt-1 inline-block rounded-full bg-amber-100 text-amber-800 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5">
                              No default prompt
                            </span>
                          ) : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {submitted && reportTypeId && !selectedReportType?.default_prompt_id ? (
                <p className="mt-3 text-xs text-amber-800">
                  This report type has no default prompt yet. Set one in Admin → Report Types.
                </p>
              ) : null}
            </div>
          </div>
        </li>
      </ol>

      <section className="mt-8 sm:mt-10">
        <button
          type="button"
          onClick={() => setOptionalOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-3 rounded-xl border border-dashed border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
        >
          <span>Optional settings</span>
          {optionalOpen ? (
            <ChevronUp className="w-4 h-4 text-gray-500" aria-hidden />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-500" aria-hidden />
          )}
        </button>
        {optionalOpen ? (
          <div className="mt-3 card p-5 sm:p-6">
            <label className="label" htmlFor="ai-model">
              AI model
            </label>
            <select
              id="ai-model"
              className="select"
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              disabled={configLoading || models.length === 0}
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-gray-500">Managed in Admin → AI Models.</p>
          </div>
        ) : null}
      </section>

      <div className="mt-10 sm:mt-12 space-y-4">
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-stretch gap-3">
          <button
            type="button"
            onClick={() => goToRunner('review_and_run')}
            disabled={configLoading}
            className="btn-primary w-full sm:w-auto min-w-[220px] justify-center text-sm py-2.5"
          >
            Review &amp; continue
            <ArrowRight className="w-4 h-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => goToRunner('customize_first')}
            disabled={configLoading}
            className="btn-secondary w-full sm:w-auto min-w-[200px] justify-center text-sm py-2.5"
          >
            Customize first
          </button>
        </div>
        <p className="text-sm text-gray-500 max-w-2xl leading-relaxed">
          
        </p>

        {submitted && (!urlLooksValid || !reportTypeId) ? (
          <div
            className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            role="status"
          >
            Enter a valid URL and pick a report type.
          </div>
        ) : null}
      </div>
    </div>
  );
}
