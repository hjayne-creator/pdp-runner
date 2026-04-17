import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  History, ChevronRight, Trash2, ExternalLink, Clock, CheckCircle2,
  AlertCircle, Loader2, ArrowLeft, Copy, Check, FileDown,
} from 'lucide-react';
import { clsx } from 'clsx';
import { api } from '../api/client';
import type { Job } from '../api/types';
import { parseReport } from '../utils/report';
import { downloadHtmlElementAsPdf } from '../utils/aiOutputPdf';
import { ReportView } from '../components/ReportView';

function StatusBadge({ status }: { status: Job['status'] }) {
  if (status === 'completed') return <span className="badge-green gap-1"><CheckCircle2 className="w-3 h-3" />Completed</span>;
  if (status === 'failed') return <span className="badge-red gap-1"><AlertCircle className="w-3 h-3" />Failed</span>;
  if (status === 'running') return <span className="badge-blue gap-1"><Loader2 className="w-3 h-3 animate-spin" />Running</span>;
  return <span className="badge-gray">Pending</span>;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

export function HistoryListPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.jobs.list(undefined, 100).then(setJobs).finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await api.jobs.delete(id);
    setJobs((j) => j.filter((x) => x.id !== id));
  };

  return (
    <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center gap-3 mb-6">
        <History className="w-5 h-5 text-brand-600" />
        <h1 className="text-xl font-semibold text-gray-900">Job History</h1>
        <span className="badge-gray ml-1">{jobs.length}</span>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          Loading…
        </div>
      )}

      {!loading && jobs.length === 0 && (
        <div className="card p-12 text-center text-gray-400">
          <History className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p className="font-medium text-gray-500">No jobs yet</p>
          <p className="text-sm mt-1">Run your first analysis to see results here.</p>
          <Link to="/" className="btn-primary mt-4 inline-flex">Run Analysis</Link>
        </div>
      )}

      {!loading && jobs.length > 0 && (
        <div className="card divide-y divide-gray-100">
          {jobs.map((job) => (
            <Link
              key={job.id}
              to={`/history/${job.id}`}
              className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <StatusBadge status={job.status} />
                  {job.customer && (
                    <span className="text-xs text-gray-500 font-medium">{job.customer.name}</span>
                  )}
                  {job.prompt && (
                    <>
                      <span className="text-gray-300">·</span>
                      <span className="text-xs text-gray-500 truncate max-w-[180px]">{job.prompt.name}</span>
                    </>
                  )}
                  {job.model && (
                    <>
                      <span className="text-gray-300">·</span>
                      <span className="text-xs text-gray-500">{job.model.display_name}</span>
                    </>
                  )}
                </div>
                <p className="text-sm text-gray-700 truncate font-mono">{job.input_url}</p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs text-gray-400">{formatDate(job.created_at)}</span>
                  {job.duration_ms != null && (
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {(job.duration_ms / 1000).toFixed(1)}s
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={(e) => handleDelete(job.id, e)}
                  className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function HistoryDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<'output' | 'prompt' | null>(null);
  const [tab, setTab] = useState<'output' | 'prompt' | 'pdp'>('output');
  const outputPdfRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!jobId) return;
    api.jobs.get(jobId).then(setJob).finally(() => setLoading(false));
  }, [jobId]);

  const copy = (which: 'output' | 'prompt') => {
    const text = which === 'output' ? job?.output : job?.prompt_rendered;
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(which);
    setTimeout(() => setCopied(null), 2000);
  };

  const downloadOutputPdf = async () => {
    if (!job?.output?.trim() || !outputPdfRef.current) return;
    try {
      await downloadHtmlElementAsPdf(outputPdfRef.current, `ai-output-report_${job.id}`);
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-gray-400">
      <Loader2 className="w-6 h-6 animate-spin" />
    </div>
  );

  if (!job) return (
    <div className="max-w-screen-xl mx-auto px-4 py-10 text-center text-gray-400">
      Job not found.
    </div>
  );

  const TABS = [
    { id: 'output', label: 'AI Output' },
    { id: 'prompt', label: 'Rendered Prompt' },
    { id: 'pdp', label: 'PDP Data' },
  ] as const;
  const parsedReport = parseReport(job.output ?? "");

  return (
    <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6">
      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        className="btn-secondary text-sm mb-5"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to History
      </button>

      {/* Header card */}
      <div className="card p-5 mb-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <StatusBadge status={job.status} />
              {job.duration_ms != null && (
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {(job.duration_ms / 1000).toFixed(1)}s
                </span>
              )}
            </div>
            <a
              href={job.input_url}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-mono text-brand-700 hover:underline flex items-center gap-1 mb-2"
            >
              {job.input_url}
              <ExternalLink className="w-3 h-3" />
            </a>
            <div className="flex items-center gap-4 text-xs text-gray-500">
              {job.customer && <span>Customer: <strong>{job.customer.name}</strong></span>}
              {job.prompt && <span>Prompt: <strong>{job.prompt.name} v{job.prompt.version}</strong></span>}
              {job.model && <span>Model: <strong>{job.model.display_name}</strong></span>}
              <span>{formatDate(job.created_at)}</span>
            </div>
          </div>
        </div>

        {job.error && (
          <div className="mt-3 bg-red-50 border border-red-100 rounded-lg px-4 py-3 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 inline mr-1.5 -mt-0.5" />
            {job.error}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200 mb-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={clsx(
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
              tab === t.id
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-gray-500 hover:text-gray-700',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {TABS.find((t) => t.id === tab)?.label}
          </span>
          {(tab === 'output' || tab === 'prompt') && (
            <div className="flex items-center gap-2">
              <button onClick={() => copy(tab as 'output' | 'prompt')} className="btn-secondary text-xs px-2.5 py-1.5">
                {copied === tab ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                {copied === tab ? 'Copied' : 'Copy'}
              </button>
              {tab === 'output' && job.output?.trim() && (
                <button
                  type="button"
                  onClick={downloadOutputPdf}
                  className="btn-secondary text-xs px-2.5 py-1.5"
                  title="Download AI output as PDF"
                >
                  <FileDown className="w-3 h-3" />
                  PDF
                </button>
              )}
            </div>
          )}
        </div>

        <div className="p-5 overflow-auto max-h-[60vh]">
          {tab === 'output' && (
            <div ref={outputPdfRef} className="bg-white rounded-lg p-4">
              {parsedReport ? (
                <ReportView report={parsedReport} />
              ) : (
                <pre className="output-prose text-sm text-gray-800 whitespace-pre-wrap">
                  {job.output || <span className="text-gray-400 italic">No output</span>}
                </pre>
              )}
            </div>
          )}
          {tab === 'prompt' && (
            <pre className="text-xs text-gray-700 font-mono whitespace-pre-wrap leading-relaxed">
              {job.prompt_rendered || <span className="text-gray-400 italic">No prompt data</span>}
            </pre>
          )}
          {tab === 'pdp' && (
            <pre className="text-xs text-gray-700 font-mono whitespace-pre-wrap leading-relaxed">
              {job.pdp_data
                ? JSON.stringify(job.pdp_data, null, 2)
                : <span className="text-gray-400 italic">No PDP data</span>
              }
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
