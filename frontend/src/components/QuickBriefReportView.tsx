import type { ReactNode } from "react";
import type {
  QuickBriefContentGapAnalysis,
  QuickBriefGapDimension,
  QuickBriefReport,
} from "../types/quickBriefReport";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">{title}</h3>
      {children}
    </section>
  );
}

function StringList({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) return <p className="text-sm text-gray-500">{empty}</p>;
  return (
    <ul className="list-disc pl-5 space-y-1 text-sm">
      {items.map((s, i) => (
        <li key={i} className="whitespace-pre-wrap">{s}</li>
      ))}
    </ul>
  );
}

function GapDimBlock({ label, dim }: { label: string; dim: QuickBriefGapDimension | undefined }) {
  if (!dim) return null;
  const rows: [string, string | number | undefined][] = [];
  if (dim.score != null) rows.push(["Score", dim.score]);
  if (dim.gap_summary) rows.push(["Summary", dim.gap_summary]);
  if (dim.notes) rows.push(["Notes", dim.notes]);
  const lists: [string, string[]][] = [];
  if (dim.missing_elements?.length) lists.push(["Missing elements", dim.missing_elements]);
  if (dim.missing_attributes?.length) lists.push(["Missing attributes", dim.missing_attributes]);
  if (dim.missing_benefits?.length) lists.push(["Missing benefits", dim.missing_benefits]);
  if (dim.missing_use_cases?.length) lists.push(["Missing use cases", dim.missing_use_cases]);
  if (dim.missing_questions?.length) lists.push(["Missing questions", dim.missing_questions]);
  if (!rows.length && !lists.length) return null;

  return (
    <div className="border border-gray-100 rounded-md p-3 bg-gray-50 text-sm space-y-2">
      <h4 className="font-medium text-gray-900 capitalize">{label.replace(/_/g, " ")}</h4>
      {rows.map(([k, v], i) => (
        <p key={`${k}-${i}`}>
          <span className="text-gray-500">{k}:</span> {String(v)}
        </p>
      ))}
      {lists.map(([title, arr]) => (
        <div key={title}>
          <p className="text-gray-500 text-xs font-medium mb-1">{title}</p>
          <StringList items={arr} empty="" />
        </div>
      ))}
    </div>
  );
}

function ContentGapSection({ data }: { data: QuickBriefContentGapAnalysis }) {
  const keys = [
    "content_depth",
    "feature_coverage",
    "benefits",
    "use_cases",
    "faq",
    "originality",
  ] as const;
  const blocks = keys.map((k) => {
    const dim = data[k];
    if (!dim) return null;
    return <GapDimBlock key={k} label={k} dim={dim} />;
  });
  const any = blocks.some(Boolean);
  if (!any) return <p className="text-sm text-gray-500">No gap analysis provided.</p>;
  return <div className="space-y-3">{blocks}</div>;
}

export function QuickBriefReportView({ report }: { report: QuickBriefReport }) {
  const meta = report.analysis_metadata;
  const bench = report.benchmark_summary;
  const breakdownEntries = bench?.score_breakdown ? Object.entries(bench.score_breakdown) : [];
  const issues = report.top_issues ?? [];
  const opportunities = report.top_opportunities ?? [];
  const sources = report.sources ?? [];
  const quickWins = report.quick_wins ?? [];
  const strategic = report.strategic_recommendations ?? [];
  const competitors = report.competitors ?? [];
  const additions = report.recommended_content_additions;
  const gen = report.generated_content?.product_description;

  return (
    <div className="space-y-4">
      {meta && (
        <Section title="Analysis metadata">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            {meta.analysis_date && (
              <div><span className="text-gray-500">Date:</span> {meta.analysis_date}</div>
            )}
            {meta.product_name && (
              <div><span className="text-gray-500">Product:</span> {meta.product_name}</div>
            )}
            {meta.category && (
              <div><span className="text-gray-500">Category:</span> {meta.category}</div>
            )}
            {meta.sku && <div><span className="text-gray-500">SKU:</span> {meta.sku}</div>}
            {meta.model && <div><span className="text-gray-500">Model:</span> {meta.model}</div>}
            {meta.product_url && (
              <div className="sm:col-span-2">
                <span className="text-gray-500">URL:</span>{" "}
                <a
                  href={meta.product_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-700 hover:underline break-all"
                >
                  {meta.product_url}
                </a>
              </div>
            )}
          </div>
        </Section>
      )}

      <Section title="Executive summary">
        <p className="text-sm whitespace-pre-wrap">{report.executive_summary ?? "N/A"}</p>
      </Section>

      <Section title="Risk, confidence & publish readiness">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div><span className="text-gray-500">Risk level:</span> {report.risk_level ?? "N/A"}</div>
          <div>
            <span className="text-gray-500">Publish readiness:</span>{" "}
            {report.publish_readiness ?? "N/A"}
          </div>
          <div>
            <span className="text-gray-500">Confidence score:</span>{" "}
            {report.confidence_score != null ? report.confidence_score : "N/A"}
          </div>
        </div>
      </Section>

      {bench && (
        <Section title="Benchmark summary">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm mb-3">
            <div>
              <span className="text-gray-500">Overall score:</span>{" "}
              {bench.overall_score != null ? bench.overall_score : "N/A"}
            </div>
            <div>
              <span className="text-gray-500">Relative position:</span>{" "}
              {bench.relative_position ?? "N/A"}
            </div>
          </div>
          {breakdownEntries.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                <thead className="bg-gray-100 text-gray-700">
                  <tr>
                    <th className="text-left px-3 py-2">Dimension</th>
                    <th className="text-left px-3 py-2">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdownEntries.map(([key, val]) => (
                    <tr key={key} className="border-t border-gray-100">
                      <td className="px-3 py-2 capitalize">{key.replace(/_/g, " ")}</td>
                      <td className="px-3 py-2">{typeof val === "number" ? val : String(val)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No score breakdown provided.</p>
          )}
        </Section>
      )}

      {competitors.length > 0 && (
        <Section title="Competitors">
          <div className="space-y-4">
            {competitors.map((c, idx) => (
              <div key={idx} className="border border-gray-100 rounded-md p-3 bg-gray-50 text-sm space-y-2">
                <div className="font-medium text-gray-900">{c.name ?? "Competitor"}</div>
                {c.url && (
                  <div>
                    <a href={c.url} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline break-all">
                      {c.url}
                    </a>
                  </div>
                )}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                  {c.price != null && <span>Price: {c.price}</span>}
                  {c.similarity_score != null && <span>Similarity: {c.similarity_score}</span>}
                  {c.is_exact_match != null && <span>Exact match: {String(c.is_exact_match)}</span>}
                </div>
                {c.content_summary && (
                  <div className="text-xs text-gray-600 flex flex-wrap gap-x-3 gap-y-1">
                    {c.content_summary.word_count != null && (
                      <span>Words: {c.content_summary.word_count}</span>
                    )}
                    <span>Features: {c.content_summary.has_features ? "yes" : "no"}</span>
                    <span>Benefits: {c.content_summary.has_benefits ? "yes" : "no"}</span>
                    <span>Use cases: {c.content_summary.has_use_cases ? "yes" : "no"}</span>
                    <span>FAQ: {c.content_summary.has_faq ? "yes" : "no"}</span>
                  </div>
                )}
                {c.strengths && c.strengths.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">Strengths</p>
                    <StringList items={c.strengths} empty="" />
                  </div>
                )}
                {c.weaknesses && c.weaknesses.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">Weaknesses</p>
                    <StringList items={c.weaknesses} empty="" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {report.content_gap_analysis && (
        <Section title="Content gap analysis">
          <ContentGapSection data={report.content_gap_analysis} />
        </Section>
      )}

      {additions && (
        <Section title="Recommended content additions">
          <div className="space-y-4 text-sm">
            {additions.features && additions.features.length > 0 && (
              <div>
                <h4 className="font-medium text-gray-800 mb-2">Features</h4>
                <div className="space-y-2">
                  {additions.features.map((f, i) => (
                    <div key={i} className="border border-gray-100 rounded p-2 bg-gray-50">
                      <p className="font-medium">{f.feature ?? "—"}</p>
                      {f.description && <p className="text-gray-700 whitespace-pre-wrap">{f.description}</p>}
                      {f.source && <p className="text-xs text-gray-500">Source: {f.source}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {additions.benefits && additions.benefits.length > 0 && (
              <div>
                <h4 className="font-medium text-gray-800 mb-2">Benefits</h4>
                <div className="space-y-2">
                  {additions.benefits.map((f, i) => (
                    <div key={i} className="border border-gray-100 rounded p-2 bg-gray-50">
                      <p className="font-medium">{f.benefit ?? "—"}</p>
                      {f.description && <p className="text-gray-700 whitespace-pre-wrap">{f.description}</p>}
                      {f.source && <p className="text-xs text-gray-500">Source: {f.source}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {additions.use_cases && additions.use_cases.length > 0 && (
              <div>
                <h4 className="font-medium text-gray-800 mb-2">Use cases</h4>
                <div className="space-y-2">
                  {additions.use_cases.map((f, i) => (
                    <div key={i} className="border border-gray-100 rounded p-2 bg-gray-50">
                      <p className="font-medium">{f.use_case ?? "—"}</p>
                      {f.description && <p className="text-gray-700 whitespace-pre-wrap">{f.description}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {additions.faq && additions.faq.length > 0 && (
              <div>
                <h4 className="font-medium text-gray-800 mb-2">FAQ</h4>
                <div className="space-y-2">
                  {additions.faq.map((f, i) => (
                    <div key={i} className="border border-gray-100 rounded p-2 bg-gray-50">
                      <p className="font-medium">{f.question ?? "—"}</p>
                      {f.answer && <p className="text-gray-700 whitespace-pre-wrap mt-1">{f.answer}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {additions.comparison_points && additions.comparison_points.length > 0 && (
              <div>
                <h4 className="font-medium text-gray-800 mb-2">Comparison points</h4>
                <div className="space-y-2">
                  {additions.comparison_points.map((f, i) => (
                    <div key={i} className="border border-gray-100 rounded p-2 bg-gray-50">
                      <p className="font-medium">{f.point ?? "—"}</p>
                      {f.details && <p className="text-gray-700 whitespace-pre-wrap mt-1">{f.details}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Section>
      )}

      {gen && (
        <Section title="Generated content">
          <div className="space-y-4 text-sm">
            {gen.short_description && (
              <div>
                <h4 className="font-medium text-gray-800 mb-1">Short description</h4>
                <p className="whitespace-pre-wrap text-gray-800">{gen.short_description}</p>
              </div>
            )}
            {gen.long_description && (
              <div>
                <h4 className="font-medium text-gray-800 mb-1">Long description</h4>
                <p className="whitespace-pre-wrap text-gray-800">{gen.long_description}</p>
              </div>
            )}
            {gen.key_features && gen.key_features.length > 0 && (
              <div>
                <h4 className="font-medium text-gray-800 mb-1">Key features</h4>
                <StringList items={gen.key_features} empty="" />
              </div>
            )}
            {gen.benefits_section && gen.benefits_section.length > 0 && (
              <div>
                <h4 className="font-medium text-gray-800 mb-2">Benefits section</h4>
                <div className="space-y-2">
                  {gen.benefits_section.map((b, i) => (
                    <div key={i} className="border border-gray-100 rounded p-2 bg-gray-50">
                      <p className="font-medium">{b.title ?? "—"}</p>
                      {b.description && <p className="whitespace-pre-wrap mt-1">{b.description}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {gen.use_cases_section && gen.use_cases_section.length > 0 && (
              <div>
                <h4 className="font-medium text-gray-800 mb-1">Use cases</h4>
                <StringList items={gen.use_cases_section} empty="" />
              </div>
            )}
            {gen.faq_section && gen.faq_section.length > 0 && (
              <div>
                <h4 className="font-medium text-gray-800 mb-2">FAQ section</h4>
                <div className="space-y-2">
                  {gen.faq_section.map((f, i) => (
                    <div key={i} className="border border-gray-100 rounded p-2 bg-gray-50">
                      <p className="font-medium">{f.question ?? "—"}</p>
                      {f.answer && <p className="whitespace-pre-wrap mt-1">{f.answer}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {gen.comparison_section && gen.comparison_section.length > 0 && (
              <div>
                <h4 className="font-medium text-gray-800 mb-2">Comparison section</h4>
                <div className="space-y-2">
                  {gen.comparison_section.map((f, i) => (
                    <div key={i} className="border border-gray-100 rounded p-2 bg-gray-50">
                      <p className="font-medium">{f.title ?? "—"}</p>
                      {f.description && <p className="whitespace-pre-wrap mt-1">{f.description}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Section>
      )}

      <Section title="Top issues">
        {issues.length === 0 ? (
          <p className="text-sm text-gray-500">No issues listed.</p>
        ) : (
          <div className="space-y-3">
            {issues.map((item, idx) => (
              <div key={idx} className="border border-gray-100 rounded-md p-3 bg-gray-50 text-sm">
                <p><span className="font-medium">Issue:</span> {item.issue ?? "N/A"}</p>
                <p><span className="font-medium">Impact:</span> {item.impact ?? "N/A"}</p>
                <p><span className="font-medium">Action:</span> {item.recommended_action ?? "N/A"}</p>
                {item.priority && (
                  <p><span className="font-medium">Priority:</span> {item.priority}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Top opportunities">
        {opportunities.length === 0 ? (
          <p className="text-sm text-gray-500">No opportunities listed.</p>
        ) : (
          <div className="space-y-3">
            {opportunities.map((item, idx) => (
              <div key={idx} className="border border-gray-100 rounded-md p-3 bg-gray-50 text-sm">
                <p><span className="font-medium">Opportunity:</span> {item.opportunity ?? "N/A"}</p>
                <p><span className="font-medium">Why it matters:</span> {item.why_it_matters ?? "N/A"}</p>
                <p><span className="font-medium">Action:</span> {item.recommended_action ?? "N/A"}</p>
                {item.estimated_impact && (
                  <p><span className="font-medium">Estimated impact:</span> {item.estimated_impact}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      {(quickWins.length > 0 || strategic.length > 0) && (
        <Section title="Quick wins & strategy">
          {quickWins.length > 0 && (
            <div className="mb-4">
              <h4 className="font-medium text-gray-800 mb-2 text-sm">Quick wins</h4>
              <StringList items={quickWins} empty="" />
            </div>
          )}
          {strategic.length > 0 && (
            <div>
              <h4 className="font-medium text-gray-800 mb-2 text-sm">Strategic recommendations</h4>
              <StringList items={strategic} empty="" />
            </div>
          )}
        </Section>
      )}

      <Section title="Sources">
        {sources.length === 0 ? (
          <p className="text-sm text-gray-500">No sources listed.</p>
        ) : (
          <ul className="list-disc pl-5 space-y-1 text-sm">
            {sources.map((src, idx) => (
              <li key={idx}>
                <a href={src} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline break-all">
                  {src}
                </a>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
