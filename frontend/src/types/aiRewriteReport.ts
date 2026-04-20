/** JSON shape for ``pdp-ai-rewrite-v1`` (see backend ``OUTPUT_CONTRACTS``). */
export interface AiRewriteReport {
  revised_title?: string;
  revised_short_description?: string;
  revised_long_description?: string;
  key_bullets?: string[];
  seo_notes?: string;
  assumptions_or_open_questions?: string[];
  sources?: string[];
}
