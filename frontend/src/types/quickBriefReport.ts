/**
 * PDP Quick Brief — matches the expanded JSON output contract (DB-driven template).
 * Fields are optional because models may omit sections.
 */

export interface QuickBriefAnalysisMetadata {
  analysis_date?: string;
  product_url?: string;
  product_name?: string;
  category?: string;
  sku?: string;
  model?: string;
}

export interface QuickBriefBenchmarkSummary {
  overall_score?: number;
  relative_position?: string;
  score_breakdown?: Record<string, number>;
}

export interface QuickBriefCompetitor {
  name?: string;
  url?: string;
  price?: string;
  is_exact_match?: boolean;
  similarity_score?: number;
  content_summary?: {
    word_count?: number;
    has_features?: boolean;
    has_benefits?: boolean;
    has_use_cases?: boolean;
    has_faq?: boolean;
  };
  strengths?: string[];
  weaknesses?: string[];
}

export interface QuickBriefGapDimension {
  score?: number;
  gap_summary?: string;
  missing_elements?: string[];
  missing_attributes?: string[];
  missing_benefits?: string[];
  missing_use_cases?: string[];
  missing_questions?: string[];
  notes?: string;
}

export interface QuickBriefContentGapAnalysis {
  content_depth?: QuickBriefGapDimension;
  feature_coverage?: QuickBriefGapDimension;
  benefits?: QuickBriefGapDimension;
  use_cases?: QuickBriefGapDimension;
  faq?: QuickBriefGapDimension;
  originality?: QuickBriefGapDimension;
}

export interface QuickBriefRecommendedAdditions {
  features?: Array<{ feature?: string; description?: string; source?: string }>;
  benefits?: Array<{ benefit?: string; description?: string; source?: string }>;
  use_cases?: Array<{ use_case?: string; description?: string }>;
  faq?: Array<{ question?: string; answer?: string }>;
  comparison_points?: Array<{ point?: string; details?: string }>;
}

export interface QuickBriefGeneratedProductDescription {
  short_description?: string;
  long_description?: string;
  key_features?: string[];
  benefits_section?: Array<{ title?: string; description?: string }>;
  use_cases_section?: string[];
  faq_section?: Array<{ question?: string; answer?: string }>;
  comparison_section?: Array<{ title?: string; description?: string }>;
}

export interface QuickBriefGeneratedContent {
  product_description?: QuickBriefGeneratedProductDescription;
}

export interface QuickBriefIssue {
  issue?: string;
  impact?: string;
  recommended_action?: string;
  priority?: string;
}

export interface QuickBriefOpportunity {
  opportunity?: string;
  why_it_matters?: string;
  recommended_action?: string;
  estimated_impact?: string;
}

export interface QuickBriefReport {
  analysis_metadata?: QuickBriefAnalysisMetadata;
  executive_summary?: string;
  risk_level?: string;
  benchmark_summary?: QuickBriefBenchmarkSummary;
  competitors?: QuickBriefCompetitor[];
  content_gap_analysis?: QuickBriefContentGapAnalysis;
  recommended_content_additions?: QuickBriefRecommendedAdditions;
  generated_content?: QuickBriefGeneratedContent;
  top_issues?: QuickBriefIssue[];
  top_opportunities?: QuickBriefOpportunity[];
  quick_wins?: string[];
  strategic_recommendations?: string[];
  publish_readiness?: string;
  confidence_score?: number;
  sources?: string[];
}
