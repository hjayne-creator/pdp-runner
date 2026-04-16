export interface ReportFix {
  current_issue?: string;
  correction?: string;
  evidence_source?: string;
}

export interface ReportParametricUpdate {
  field?: string;
  current_value?: string;
  corrected_or_added_value?: string;
  source?: string;
  confidence?: string;
}

export interface ReportContentBlock {
  block_title?: string;
  why_it_helps?: string;
  source_basis?: string;
  proposed_block_copy?: string;
}

export interface PDPReport {
  product_summary?: {
    manufacturer?: string;
    manufacturer_part_number?: string;
    product_type?: string;
    revision_assessment?: string;
  };
  accuracy_cleanup_fixes?: ReportFix[];
  parametric_updates?: ReportParametricUpdate[];
  recommended_new_content_blocks?: ReportContentBlock[] | string[];
  revised_overview_copy?: string;
  final_publishing_recommendation?: string;
  sources?: string[];
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

  // Whole response is JSON
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;

  // ```json ... ```
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    const candidate = fenced[1].trim();
    if (candidate.startsWith("{") && candidate.endsWith("}")) return candidate;
  }

  // Fallback: first object-like chunk
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return null;
}

function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

export function parseReport(output: string): PDPReport | null {
  const jsonBlock = extractJsonBlock(output);
  if (!jsonBlock) return null;

  const parsed = safeJsonParse(jsonBlock);
  if (!isObject(parsed)) return null;

  const hasExpectedKey =
    "product_summary" in parsed ||
    "accuracy_cleanup_fixes" in parsed ||
    "parametric_updates" in parsed ||
    "revised_overview_copy" in parsed;

  if (!hasExpectedKey) return null;
  return parsed as PDPReport;
}
