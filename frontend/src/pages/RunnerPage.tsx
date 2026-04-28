import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Zap, Globe, ChevronDown, Play, Square, RotateCcw, Copy, Check,
  Clock, AlertCircle, CheckCircle2, Loader2, ExternalLink, FileDown, X,
} from 'lucide-react';
import { clsx } from 'clsx';
import { api } from '../api/client';
import type {
  Prompt, AIModel, SSEEvent, ReportType, VerifiedCompetitorOption, CompetitorVerifyResult,
} from '../api/types';
import type { HomeToRunnerIntent, RunnerPrefillState } from '../utils/workflow';
import { downloadHtmlElementAsPdf } from '../utils/aiOutputPdf';
import { Modal } from '../components/Modal';
import { DynamicReportView } from '../components/DynamicReportView';

type Status = 'idle' | 'fetching' | 'running' | 'done' | 'error';

interface StatusMsg {
  type: 'status' | 'warning' | 'error';
  message: string;
}

interface HomeHandoff {
  intent: HomeToRunnerIntent;
  inputUrl: string;
  reportLabel: string;
  modelLabel: string;
  dismissed: boolean;
}

export function RunnerPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const prefillAppliedRef = useRef(false);
  const runBtnRef = useRef<HTMLButtonElement>(null);
  const handoffFocusAppliedRef = useRef(false);

  const [tenantCustomerId, setTenantCustomerId] = useState('');
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [models, setModels] = useState<AIModel[]>([]);
  const [reportTypes, setReportTypes] = useState<ReportType[]>([]);

  const [url, setUrl] = useState('');
  const [reportTypeId, setReportTypeId] = useState('');
  const [promptId, setPromptId] = useState('');
  const [modelId, setModelId] = useState('');
  const [verifyOverride, setVerifyOverride] = useState<boolean | null>(null);

  const [status, setStatus] = useState<Status>('idle');
  const [statusMessages, setStatusMessages] = useState<StatusMsg[]>([]);
  const [output, setOutput] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [homeHandoff, setHomeHandoff] = useState<HomeHandoff | null>(null);
  const [competitorSelectionOpen, setCompetitorSelectionOpen] = useState(false);
  const [competitorOptions, setCompetitorOptions] = useState<VerifiedCompetitorOption[]>([]);
  const [selectedCompetitorUrls, setSelectedCompetitorUrls] = useState<string[]>([]);
  const [competitorSummary, setCompetitorSummary] = useState('');
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [precheckBadge, setPrecheckBadge] = useState<
    'idle' | 'running' | 'completed' | 'skipped'
  >('idle');

  const outputRef = useRef<HTMLDivElement>(null);
  const pdfContentRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    api.customers
      .list()
      .then((customers) => {
        const id = customers[0]?.id ?? '';
        setTenantCustomerId(id);
      })
      .catch(console.error);
    api.reportTypes
      .list({ activeOnly: true })
      .then((rts) => {
        setReportTypes(rts);
        setReportTypeId((prev) => (prev && rts.some((rt) => rt.id === prev) ? prev : rts[0]?.id ?? ''));
      })
      .catch(console.error);
    api.models
      .list()
      .then((ms) => {
        setModels(ms);
        if (ms.length > 0) setModelId((prev) => (prev && ms.some((m) => m.id === prev) ? prev : ms[0].id));
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    api.prompts
      .list()
      .then((ps) => {
        setPrompts(ps);
      })
      .catch(console.error);
  }, []);

  const selectedReportType = useMemo(
    () => reportTypes.find((rt) => rt.id === reportTypeId) ?? null,
    [reportTypes, reportTypeId],
  );

  // Default the prompt to the report type's default whenever the type changes,
  // unless the user has explicitly chosen a prompt this session.
  const promptManuallyChangedRef = useRef(false);
  useEffect(() => {
    if (promptManuallyChangedRef.current) return;
    if (!selectedReportType) {
      if (prompts.length > 0 && !promptId) setPromptId(prompts[0].id);
      return;
    }
    if (selectedReportType.default_prompt_id) {
      const exists = prompts.some((p) => p.id === selectedReportType.default_prompt_id);
      if (exists) {
        setPromptId(selectedReportType.default_prompt_id);
        return;
      }
    }
    if (prompts.length > 0 && !promptId) setPromptId(prompts[0].id);
  }, [selectedReportType, prompts, promptId]);

  // Apply Home → Runner prefill once
  useEffect(() => {
    const s = location.state as RunnerPrefillState | null;
    if (!s?.fromHome || prefillAppliedRef.current) return;
    if (s.modelId && models.length === 0) return;
    if (s.promptId && prompts.length === 0) return;
    if (s.reportTypeId && reportTypes.length === 0) return;

    prefillAppliedRef.current = true;
    if (s.inputUrl) setUrl(s.inputUrl);
    if (s.modelId && models.some((m) => m.id === s.modelId)) setModelId(s.modelId);
    if (s.reportTypeId && reportTypes.some((rt) => rt.id === s.reportTypeId)) {
      setReportTypeId(s.reportTypeId);
    }
    if (s.promptId && prompts.some((p) => p.id === s.promptId)) {
      promptManuallyChangedRef.current = true;
      setPromptId(s.promptId);
    }
    if (typeof s.verifyCompetitors === 'boolean') setVerifyOverride(s.verifyCompetitors);

    const intent: HomeToRunnerIntent = s.homeIntent ?? 'customize_first';
    const rt = s.reportTypeId ? reportTypes.find((r) => r.id === s.reportTypeId) : undefined;
    const md = s.modelId ? models.find((m) => m.id === s.modelId) : undefined;
    setHomeHandoff({
      intent,
      inputUrl: (s.inputUrl ?? '').trim(),
      reportLabel: rt?.label ?? 'Report type',
      modelLabel: md?.display_name ?? 'Model',
      dismissed: false,
    });
    handoffFocusAppliedRef.current = false;

    navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate, models, prompts, reportTypes]);

  useEffect(() => {
    const h = homeHandoff && !homeHandoff.dismissed ? homeHandoff : null;
    if (!h || h.intent !== 'review_and_run') {
      handoffFocusAppliedRef.current = false;
      return;
    }
    if (status !== 'idle') return;
    if (handoffFocusAppliedRef.current) return;
    handoffFocusAppliedRef.current = true;
    runBtnRef.current?.focus({ preventScroll: true });
  }, [homeHandoff, status]);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  const selectedPrompt = prompts.find((p) => p.id === promptId);
  const jobCustomerId = selectedPrompt?.customer_id ?? tenantCustomerId;

  const verifyEffective = verifyOverride !== null
    ? verifyOverride
    : Boolean(selectedReportType?.requires_competitor_verification);

  const canRun =
    url.trim() && jobCustomerId && promptId && modelId && reportTypeId && status !== 'running' && !preflightLoading;

  const runStream = useCallback(async (selectedUrls?: string[]) => {
    abortRef.current = new AbortController();
    setStatus('fetching');
    setOutput('');
    setJobId(null);
    setDurationMs(null);

    try {
      await api.jobs.run(
        {
          customer_id: jobCustomerId,
          prompt_id: promptId,
          model_id: modelId,
          input_url: url.trim(),
          report_type_id: reportTypeId,
          verify_competitors: verifyOverride,
          selected_competitor_urls: selectedUrls ?? null,
        },
        (event: SSEEvent) => {
          if (event.type === 'status') {
            setStatusMessages((m) => [...m, { type: 'status', message: event.message }]);
            if (event.message.includes('Running')) setStatus('running');
          } else if (event.type === 'warning') {
            setStatusMessages((m) => [...m, { type: 'warning', message: event.message }]);
          } else if (event.type === 'token') {
            setOutput((o) => o + event.content);
          } else if (event.type === 'error') {
            setStatusMessages((m) => [...m, { type: 'error', message: event.message }]);
            setStatus('error');
          } else if (event.type === 'done') {
            setJobId(event.job_id);
            setDurationMs(event.duration_ms);
            setStatus('done');
          }
        },
        abortRef.current.signal,
      );
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        setStatus('idle');
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        setStatusMessages((m) => [...m, { type: 'error', message: msg }]);
        setStatus('error');
      }
    }
  }, [jobCustomerId, promptId, modelId, url, reportTypeId, verifyOverride]);

  const maybeRunCompetitorPrecheck = useCallback(async (): Promise<CompetitorVerifyResult | null> => {
    if (!verifyEffective) {
      setPrecheckBadge('skipped');
      setStatusMessages((m) => [
        ...m,
        { type: 'status', message: 'Competitor verification not selected; continuing without competitor context.' },
      ]);
      return null;
    }

    setPreflightLoading(true);
    setPrecheckBadge('running');
    setStatus('fetching');
    setStatusMessages((m) => [...m, { type: 'status', message: 'Verifying competitor PDPs before run...' }]);
    try {
      const result = await api.jobs.verifyCompetitors({
        input_url: url.trim(),
        report_type_id: reportTypeId,
        verify_competitors: verifyOverride,
      });
      setPrecheckBadge(result.skipped ? 'skipped' : 'completed');
      setStatusMessages((m) => [...m, { type: result.skipped ? 'warning' : 'status', message: result.summary_message }]);
      return result;
    } finally {
      setPreflightLoading(false);
    }
  }, [verifyEffective, url, reportTypeId, verifyOverride]);

  const handleRun = useCallback(async () => {
    if (!canRun) return;

    setHomeHandoff((h) => (h ? { ...h, dismissed: true } : h));

    setOutput('');
    setStatusMessages([]);
    setJobId(null);
    setDurationMs(null);
    setCompetitorSelectionOpen(false);
    setCompetitorOptions([]);
    setSelectedCompetitorUrls([]);
    setCompetitorSummary('');
    setPrecheckBadge('idle');

    try {
      const precheck = await maybeRunCompetitorPrecheck();
      if (precheck?.verification_enabled && precheck.options.length > 0) {
        setCompetitorOptions(precheck.options);
        setSelectedCompetitorUrls(precheck.options.map((o) => o.url));
        setCompetitorSummary(precheck.summary_message);
        setCompetitorSelectionOpen(true);
        setStatus('idle');
        return;
      }

      await runStream();
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        setStatus('idle');
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        setStatusMessages((m) => [...m, { type: 'error', message: msg }]);
        setStatus('error');
      }
    }
  }, [canRun, maybeRunCompetitorPrecheck, runStream]);

  const handleStop = () => {
    abortRef.current?.abort();
    setStatus('idle');
  };

  const toggleCompetitor = (u: string, checked: boolean) => {
    setSelectedCompetitorUrls((prev) => {
      const next = new Set(prev);
      if (checked) next.add(u);
      else next.delete(u);
      return Array.from(next);
    });
  };

  const continueWithSelectedCompetitors = async () => {
    setCompetitorSelectionOpen(false);
    setStatusMessages((m) => [
      ...m,
      {
        type: 'status',
        message:
          selectedCompetitorUrls.length > 0
            ? `Including ${selectedCompetitorUrls.length} selected verified competitor PDP(s).`
            : 'No competitors selected; continuing without competitor context.',
      },
    ]);
    await runStream(selectedCompetitorUrls);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadPdf = async () => {
    if (!pdfContentRef.current) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    try {
      await downloadHtmlElementAsPdf(pdfContentRef.current, `ai-output-report_${stamp}`);
    } catch (e) {
      console.error(e);
    }
  };

  const handleReset = () => {
    setOutput('');
    setStatusMessages([]);
    setStatus('idle');
    setJobId(null);
    setDurationMs(null);
  };

  const selectedModel = models.find((m) => m.id === modelId);
  const parsedJson = useMemo(() => {
    if (!output) return null;
    try {
      const trimmed = output.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) return JSON.parse(trimmed) as Record<string, unknown>;
      const m = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (m?.[1]) return JSON.parse(m[1]) as Record<string, unknown>;
      const first = trimmed.indexOf('{');
      const last = trimmed.lastIndexOf('}');
      if (first >= 0 && last > first) return JSON.parse(trimmed.slice(first, last + 1)) as Record<string, unknown>;
    } catch {
      return null;
    }
    return null;
  }, [output]);

  const activeHandoff = homeHandoff && !homeHandoff.dismissed ? homeHandoff : null;
  const emphasizeRun = activeHandoff?.intent === 'review_and_run' && status === 'idle';
  const coldRunnerIntro =
    !url.trim() &&
    status === 'idle' &&
    !(location.state as RunnerPrefillState | null)?.fromHome;

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6">
      <Modal
        open={competitorSelectionOpen}
        onClose={() => {
          setSelectedCompetitorUrls([]);
          void continueWithSelectedCompetitors();
        }}
        title="Select verified competitors to include"
        size="lg"
      >
        <p className="text-sm text-gray-600 mb-3">{competitorSummary}</p>
        {competitorOptions.length === 0 ? (
          <p className="text-sm text-gray-500">No verified competitors found.</p>
        ) : (
          <div className="space-y-3">
            {competitorOptions.map((opt) => (
              <label key={opt.url} className="block rounded-lg border border-gray-200 p-3 hover:bg-gray-50">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                    checked={selectedCompetitorUrls.includes(opt.url)}
                    onChange={(e) => toggleCompetitor(opt.url, e.target.checked)}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{opt.title || opt.url}</p>
                    <a
                      href={opt.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-xs text-brand-600 break-all hover:underline"
                      title="Open competitor product page"
                    >
                      {opt.url}
                    </a>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600">
                      <span>Match rate: {(opt.match_rate * 100).toFixed(0)}%</span>
                      <span>Reason: {opt.reason}</span>
                      {opt.price ? <span>Price: {opt.price}</span> : null}
                      {opt.scrape_source ? <span>Source: {opt.scrape_source}</span> : null}
                    </div>
                    {opt.snippet ? (
                      <p className="mt-1 text-xs text-gray-500 line-clamp-3">{opt.snippet}</p>
                    ) : null}
                  </div>
                </div>
              </label>
            ))}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="btn-secondary px-3 py-2 text-sm"
                onClick={() => setSelectedCompetitorUrls([])}
              >
                Select none
              </button>
              <button
                type="button"
                className="btn-primary px-3 py-2 text-sm"
                onClick={continueWithSelectedCompetitors}
              >
                Continue run
              </button>
            </div>
          </div>
        )}
      </Modal>
      <div className="flex flex-col xl:flex-row gap-6 min-h-[calc(100vh-5rem)]">

        {/* ── LEFT: Input Panel ──────────────────────────────────────────── */}
        <div className="w-full xl:w-[380px] shrink-0 flex flex-col gap-4">

          {coldRunnerIntro && (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
              <p className="font-medium text-gray-800">Runner</p>
              <p className="mt-1 text-xs text-gray-500 leading-relaxed">
                Paste a product URL and choose report options here, or use the{' '}
                <Link to="/" className="text-brand-600 hover:underline font-medium">
                  home page
                </Link>{' '}
                for a guided quick start.
              </p>
            </div>
          )}

          {activeHandoff && (
            <div
              className="rounded-xl border border-brand-200 bg-brand-50/90 px-4 py-3 text-sm text-gray-800 shadow-sm"
              role="region"
              aria-label="Quick start from home"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 space-y-2">
                  <p className="font-medium text-gray-900">Report settings</p>
                  {activeHandoff.intent === 'review_and_run' ? (
                    <p className="text-xs text-gray-600 leading-relaxed">
                      Review the panel below, then click <span className="font-medium text-gray-800">Run analysis</span> to
                      start. You can still change any field first.
                    </p>
                  ) : (
                    <p className="text-xs text-gray-600 leading-relaxed">
                      Adjust prompt, model, or verification if you like. Nothing runs until you click{' '}
                      <span className="font-medium text-gray-800">Run analysis</span>.
                    </p>
                  )}
                  <dl className="grid gap-1 text-xs text-gray-600 border-t border-brand-100/80 pt-2 mt-2">
                    <div className="flex gap-2 min-w-0">
                      <dt className="shrink-0 text-gray-500">URL</dt>
                      <dd className="font-mono text-[11px] text-gray-800 truncate" title={activeHandoff.inputUrl}>
                        {activeHandoff.inputUrl || '—'}
                      </dd>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <dt className="shrink-0 text-gray-500">Report</dt>
                      <dd className="text-gray-800">{activeHandoff.reportLabel}</dd>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <dt className="shrink-0 text-gray-500">Model</dt>
                      <dd className="text-gray-800">{activeHandoff.modelLabel}</dd>
                    </div>
                  </dl>
                </div>
                <button
                  type="button"
                  onClick={() => setHomeHandoff((h) => (h ? { ...h, dismissed: true } : h))}
                  className="shrink-0 rounded-lg p-1 text-gray-500 hover:bg-brand-100/80 hover:text-gray-800 transition"
                  aria-label="Dismiss quick start notice"
                >
                  <X className="w-4 h-4" aria-hidden />
                </button>
              </div>
            </div>
          )}

          {/* URL input */}
          <div className="card p-5">
            <label className="label">Product Page URL</label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="url"
                className="input pl-9"
                placeholder="https://www.jameco.com/z/..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleRun(); }}
                disabled={status === 'running'}
              />
            </div>
          </div>

          {/* Config selectors */}
          <div className="card p-5 flex flex-col gap-4">
            {/* Report type */}
            <div>
              <label className="label">Report type</label>
              {reportTypes.length === 0 ? (
                <p className="text-sm text-gray-400 italic">
                  No report types yet.{' '}
                  <Link to="/admin" className="text-brand-600 hover:underline">
                    Create one in Admin
                  </Link>.
                </p>
              ) : (
                <select
                  className="select"
                  value={reportTypeId}
                  onChange={(e) => {
                    setReportTypeId(e.target.value);
                    promptManuallyChangedRef.current = false;
                    setVerifyOverride(null);
                  }}
                  disabled={status === 'running'}
                >
                  {reportTypes.map((rt) => (
                    <option key={rt.id} value={rt.id}>{rt.label}</option>
                  ))}
                </select>
              )}
              {selectedReportType?.description && (
                <p className="mt-1.5 text-xs text-gray-400 line-clamp-2">
                  {selectedReportType.description}
                </p>
              )}
            </div>

            {/* Prompt (defaults from report type, can override) */}
            <div>
              <label className="label">Prompt</label>
              {prompts.length === 0 ? (
                <p className="text-sm text-gray-400 italic">
                  No prompts yet.{' '}
                  <Link to="/admin" className="text-brand-600 hover:underline">Create prompts in Admin</Link>.
                </p>
              ) : (
                <select
                  className="select"
                  value={promptId}
                  onChange={(e) => {
                    promptManuallyChangedRef.current = true;
                    setPromptId(e.target.value);
                  }}
                  disabled={status === 'running'}
                >
                  {prompts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {selectedReportType?.default_prompt_id === p.id ? ' · default' : ''}
                    </option>
                  ))}
                </select>
              )}
              {selectedPrompt && (
                <p className="mt-1.5 text-xs text-gray-400 line-clamp-2">
                  {selectedPrompt.description}
                </p>
              )}
            </div>

            {/* Model */}
            <div>
              <label className="label">AI Model</label>
              <select
                className="select"
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                disabled={status === 'running'}
              >
                <option value="">Select a model…</option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>{m.display_name}</option>
                ))}
              </select>
              {selectedModel && (
                <p className="mt-1.5 text-xs text-gray-400">{selectedModel.description}</p>
              )}
            </div>

            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                className="mt-0.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                checked={verifyEffective}
                onChange={(e) => setVerifyOverride(e.target.checked)}
                disabled={status === 'running'}
              />
              <span>
                <span className="text-sm font-medium text-gray-700">Verify competitor PDPs</span>
                <span className="block text-xs text-gray-400 mt-0.5">
                  SerpAPI (Google US, English) + Firecrawl scrape; only identifier-matched URLs are injected into the prompt.
                  {selectedReportType ? (
                    <>
                      {' '}Default for this report type:{' '}
                      <code className="text-[11px] bg-gray-100 px-1 rounded">
                        {selectedReportType.requires_competitor_verification ? 'on' : 'off'}
                      </code>
                    </>
                  ) : null}
                </span>
              </span>
            </label>
          </div>

          {/* CTA */}
          <div className="flex gap-2">
            {status === 'running' ? (
              <button onClick={handleStop} className="btn-danger flex-1 justify-center py-2.5 text-sm">
                <Square className="w-4 h-4" />
                Stop
              </button>
            ) : (
              <button
                ref={runBtnRef}
                onClick={handleRun}
                disabled={!canRun}
                className={clsx(
                  'btn-primary flex-1 justify-center py-2.5 text-sm transition-shadow',
                  emphasizeRun && 'ring-2 ring-brand-400 ring-offset-2 shadow-md',
                )}
              >
                <Play className="w-4 h-4" />
                Run Analysis
              </button>
            )}
            {(output || status === 'error') && (
              <button onClick={handleReset} className="btn-secondary px-3 py-2.5">
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Status messages */}
          {statusMessages.length > 0 && (
            <div className="card p-4 flex flex-col gap-2">
              {statusMessages.map((msg, i) => (
                <div key={i} className={clsx('flex items-start gap-2 text-xs', {
                  'text-gray-500': msg.type === 'status',
                  'text-yellow-700': msg.type === 'warning',
                  'text-red-600': msg.type === 'error',
                })}>
                  {msg.type === 'status' && <Loader2 className="w-3 h-3 mt-0.5 shrink-0 animate-spin" />}
                  {msg.type === 'warning' && <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />}
                  {msg.type === 'error' && <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />}
                  <span>{msg.message}</span>
                </div>
              ))}
            </div>
          )}

          {/* Prompt preview */}
          {selectedPrompt && (
            <details className="card p-4 group">
              <summary className="label cursor-pointer select-none flex items-center justify-between">
                Prompt Preview
                <ChevronDown className="w-3 h-3 transition-transform group-open:rotate-180" />
              </summary>
              <pre className="mt-3 text-xs text-gray-600 whitespace-pre-wrap font-mono leading-relaxed max-h-60 overflow-y-auto">
                {selectedPrompt.content}
              </pre>
            </details>
          )}
        </div>

        {/* ── RIGHT: Output Panel ────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col card overflow-hidden">
          {/* Output header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-gray-700">Output</span>
              {status === 'done' && (
                <span className="badge-green gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Complete
                </span>
              )}
              {status === 'running' && (
                <span className="badge-blue gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Streaming…
                </span>
              )}
              {status === 'error' && (
                <span className="badge-red gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Error
                </span>
              )}
              {precheckBadge === 'running' && (
                <span className="badge-blue gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Competitor Precheck
                </span>
              )}
              {precheckBadge === 'completed' && (
                <span className="badge-green gap-1" title="Competitor precheck completed">
                  <CheckCircle2 className="w-3 h-3" />
                  Precheck Complete
                </span>
              )}
              {precheckBadge === 'skipped' && (
                <span className="badge-gray gap-1" title="Competitor precheck skipped">
                  <AlertCircle className="w-3 h-3" />
                  Precheck Skipped
                </span>
              )}
              {durationMs != null && (
                <span className="badge-gray gap-1">
                  <Clock className="w-3 h-3" />
                  {(durationMs / 1000).toFixed(1)}s
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {jobId && (
                <Link
                  to={`/history/${jobId}`}
                  className="btn-secondary text-xs px-2.5 py-1.5"
                >
                  <ExternalLink className="w-3 h-3" />
                  View Job
                </Link>
              )}
              {output && (
                <>
                  <button onClick={handleCopy} className="btn-secondary text-xs px-2.5 py-1.5">
                    {copied ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadPdf}
                    className="btn-secondary text-xs px-2.5 py-1.5"
                    title="Download report as PDF"
                  >
                    <FileDown className="w-3 h-3" />
                    PDF
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Output body */}
          <div
            ref={outputRef}
            className="flex-1 overflow-y-auto p-5 bg-gray-50"
          >
            {!output && status === 'idle' && (
              <div className="h-full flex flex-col items-center justify-center text-center text-gray-400">
                <div className="w-16 h-16 rounded-2xl bg-brand-50 flex items-center justify-center mb-4">
                  <Zap className="w-8 h-8 text-brand-400" />
                </div>
                <p className="text-sm font-medium text-gray-500">Ready to analyze</p>
                <p className="text-xs mt-1 max-w-xs">
                  Enter a product page URL, select your configuration, and click Run Analysis.
                </p>
              </div>
            )}

            {!output && status === 'fetching' && (
              <div className="h-full flex items-center justify-center">
                <div className="text-center text-gray-400">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-brand-400" />
                  <p className="text-sm">Fetching product page…</p>
                </div>
              </div>
            )}

            {output && (
              <div ref={pdfContentRef} className="bg-white rounded-lg p-4 shadow-sm">
                {selectedReportType?.report_definition && parsedJson && status !== 'running' ? (
                  <DynamicReportView definition={selectedReportType.report_definition} parsedOutput={parsedJson} />
                ) : (
                  <div
                    className={clsx(
                      'output-prose text-sm text-gray-800',
                      status === 'running' && 'cursor-blink',
                    )}
                  >
                    {output}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
