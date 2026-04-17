import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Zap, Globe, ChevronDown, Play, Square, RotateCcw, Copy, Check,
  Clock, AlertCircle, CheckCircle2, Loader2, ExternalLink, FileDown,
} from 'lucide-react';
import { clsx } from 'clsx';
import { api } from '../api/client';
import type { Customer, Prompt, AIModel, SSEEvent } from '../api/types';
import { parseReport } from '../utils/report';
import { downloadHtmlElementAsPdf } from '../utils/aiOutputPdf';
import { ReportView } from '../components/ReportView';

type Status = 'idle' | 'fetching' | 'running' | 'done' | 'error';

interface StatusMsg {
  type: 'status' | 'warning' | 'error';
  message: string;
}

export function RunnerPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [models, setModels] = useState<AIModel[]>([]);

  const [url, setUrl] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [promptId, setPromptId] = useState('');
  const [modelId, setModelId] = useState('');

  const [status, setStatus] = useState<Status>('idle');
  const [statusMessages, setStatusMessages] = useState<StatusMsg[]>([]);
  const [output, setOutput] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const outputRef = useRef<HTMLDivElement>(null);
  const pdfContentRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load customers + models
  useEffect(() => {
    api.customers.list().then(setCustomers).catch(console.error);
    api.models.list().then((ms) => {
      setModels(ms);
      if (ms.length > 0 && !modelId) setModelId(ms[0].id);
    }).catch(console.error);
  }, []);

  // Load prompts when customer changes
  useEffect(() => {
    if (!customerId) { setPrompts([]); setPromptId(''); return; }
    api.prompts.list(customerId).then((ps) => {
      setPrompts(ps);
      if (ps.length > 0) setPromptId(ps[0].id);
      else setPromptId('');
    }).catch(console.error);
  }, [customerId]);

  // Auto-scroll output
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  const canRun = url.trim() && customerId && promptId && modelId && status !== 'running';

  const handleRun = useCallback(async () => {
    if (!canRun) return;

    abortRef.current = new AbortController();
    setStatus('fetching');
    setOutput('');
    setStatusMessages([]);
    setJobId(null);
    setDurationMs(null);

    try {
      await api.jobs.run(
        { customer_id: customerId, prompt_id: promptId, model_id: modelId, input_url: url.trim() },
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
  }, [canRun, url, customerId, promptId, modelId]);

  const handleStop = () => {
    abortRef.current?.abort();
    setStatus('idle');
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
  const selectedPrompt = prompts.find((p) => p.id === promptId);
  const parsedReport = parseReport(output);

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex flex-col xl:flex-row gap-6 min-h-[calc(100vh-5rem)]">

        {/* ── LEFT: Input Panel ──────────────────────────────────────────── */}
        <div className="w-full xl:w-[380px] shrink-0 flex flex-col gap-4">

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
            {/* Customer */}
            <div>
              <label className="label">Customer</label>
              {customers.length === 0 ? (
                <p className="text-sm text-gray-400 italic">
                  No customers yet.{' '}
                  <Link to="/admin" className="text-brand-600 hover:underline">Add one in Admin</Link>
                </p>
              ) : (
                <select
                  className="select"
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  disabled={status === 'running'}
                >
                  <option value="">Select a customer…</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Prompt */}
            <div>
              <label className="label">Prompt</label>
              {!customerId ? (
                <p className="text-xs text-gray-400 italic">Select a customer first</p>
              ) : prompts.length === 0 ? (
                <p className="text-sm text-gray-400 italic">
                  No prompts for this customer.{' '}
                  <Link to="/admin" className="text-brand-600 hover:underline">Create one</Link>
                </p>
              ) : (
                <select
                  className="select"
                  value={promptId}
                  onChange={(e) => setPromptId(e.target.value)}
                  disabled={status === 'running'}
                >
                  {prompts.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
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
                onClick={handleRun}
                disabled={!canRun}
                className="btn-primary flex-1 justify-center py-2.5 text-sm"
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
                    title="Download AI output as PDF"
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
                {parsedReport && status !== 'running' ? (
                  <ReportView report={parsedReport} />
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
