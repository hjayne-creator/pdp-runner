import type { ReactNode } from "react";
import { QuickBriefReportView } from "../components/QuickBriefReportView";
import { AiRewriteReportView } from "../components/AiRewriteReportView";
import type { QuickBriefReport } from "../types/quickBriefReport";
import type { AiRewriteReport } from "../types/aiRewriteReport";

export { type QuickBriefReport } from "../types/quickBriefReport";

export const DEFAULT_REPORT_TEMPLATE = "pdp-ai-rewrite-v1";

/** Top-level keys from the expanded quick-brief JSON contract (DB-driven). */
const QUICK_BRIEF_TOP_KEYS = new Set([
  "analysis_metadata",
  "executive_summary",
  "risk_level",
  "benchmark_summary",
  "competitors",
  "content_gap_analysis",
  "recommended_content_additions",
  "generated_content",
  "top_issues",
  "top_opportunities",
  "quick_wins",
  "strategic_recommendations",
  "publish_readiness",
  "confidence_score",
  "sources",
]);

interface ReportTemplateDefinition<TParsed> {
  id: string;
  label: string;
  description: string;
  parse: (output: string) => TParsed | null;
  render: (parsed: TParsed) => ReactNode;
}

function safeJsonParse(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractJsonBlock(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    const candidate = fenced[1].trim();
    if (candidate.startsWith("{") && candidate.endsWith("}")) return candidate;
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseQuickBrief(output: string): QuickBriefReport | null {
  const jsonBlock = extractJsonBlock(output);
  if (!jsonBlock) return null;

  const parsed = safeJsonParse(jsonBlock);
  if (!isObject(parsed)) return null;

  const hasExpectedKey = Object.keys(parsed).some((k) => QUICK_BRIEF_TOP_KEYS.has(k));
  if (!hasExpectedKey) return null;

  return parsed as QuickBriefReport;
}

function parseAiRewrite(output: string): AiRewriteReport | null {
  const jsonBlock = extractJsonBlock(output);
  if (!jsonBlock) return null;

  const parsed = safeJsonParse(jsonBlock);
  if (!isObject(parsed)) return null;

  const hasShape =
    "revised_title" in parsed ||
    "revised_short_description" in parsed ||
    "revised_long_description" in parsed ||
    "key_bullets" in parsed;
  if (!hasShape) return null;

  return parsed as AiRewriteReport;
}

/** Same JSON contract as the legacy quick-brief shape; used by retail gap-analysis report types. */
const GAP_ANALYSIS_TEMPLATE: ReportTemplateDefinition<QuickBriefReport> = {
  id: "pdp-gap-analysis-v1",
  label: "PDP Gap Analysis",
  description: "Competitive gap analysis (quick-brief JSON contract).",
  parse: parseQuickBrief,
  render: (parsed) => <QuickBriefReportView report={parsed} />,
};

const GAP_ANALYSIS_REWRITE_TEMPLATE: ReportTemplateDefinition<QuickBriefReport> = {
  id: "pdp-gap-analysis-rewrite-v1",
  label: "PDP Gap Analysis + Rewrite",
  description: "Gap analysis plus revised copy (quick-brief JSON contract).",
  parse: parseQuickBrief,
  render: (parsed) => <QuickBriefReportView report={parsed} />,
};

const AI_REWRITE_TEMPLATE: ReportTemplateDefinition<AiRewriteReport> = {
  id: "pdp-ai-rewrite-v1",
  label: "PDP AI Rewrite",
  description: "Revised title, short and long descriptions, bullets, SEO notes, and sources.",
  parse: parseAiRewrite,
  render: (parsed) => <AiRewriteReportView report={parsed} />,
};

const REPORT_TEMPLATES = [
  GAP_ANALYSIS_TEMPLATE,
  GAP_ANALYSIS_REWRITE_TEMPLATE,
  AI_REWRITE_TEMPLATE,
] as const;

export type ReportTemplateId = (typeof REPORT_TEMPLATES)[number]["id"];

export interface KnownReportTemplate {
  id: string;
  label: string;
  description: string;
  parse: (output: string) => unknown | null;
  render: (parsed: unknown) => ReactNode;
}

export function listKnownReportTemplates(): KnownReportTemplate[] {
  return REPORT_TEMPLATES as unknown as KnownReportTemplate[];
}

export function getKnownReportTemplate(templateId?: string): KnownReportTemplate | null {
  return listKnownReportTemplates().find((template) => template.id === templateId) ?? null;
}

/** Output format keys that resolve to a structured report UI (Admin badges, docs). */
export function getRegisteredRendererTemplateIds(): string[] {
  return listKnownReportTemplates().map((t) => t.id);
}
