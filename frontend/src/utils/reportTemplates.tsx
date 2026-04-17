import type { ReactNode } from "react";
import { ReportView } from "../components/ReportView";
import { QuickBriefReportView } from "../components/QuickBriefReportView";
import { parseReport, type PDPReport } from "./report";
import type { QuickBriefReport } from "../types/quickBriefReport";

export { type QuickBriefReport } from "../types/quickBriefReport";

export const DEFAULT_REPORT_TEMPLATE = "pdp-audit-v1";

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

const AUDIT_TEMPLATE: ReportTemplateDefinition<PDPReport> = {
  id: "pdp-audit-v1",
  label: "PDP Audit (Detailed)",
  description: "Full audit with cleanup fixes, parametric updates, and revised overview copy.",
  parse: parseReport,
  render: (parsed) => <ReportView report={parsed} />,
};

const QUICK_BRIEF_TEMPLATE: ReportTemplateDefinition<QuickBriefReport> = {
  id: "pdp-quick-brief-v1",
  label: "PDP Quick Brief",
  description:
    "Competitive benchmark, gap analysis, recommended additions, generated copy, issues and opportunities.",
  parse: parseQuickBrief,
  render: (parsed) => <QuickBriefReportView report={parsed} />,
};

const REPORT_TEMPLATES = [AUDIT_TEMPLATE, QUICK_BRIEF_TEMPLATE] as const;

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
