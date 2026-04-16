import type { PDPReport } from "../utils/report";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">{title}</h3>
      {children}
    </section>
  );
}

export function ReportView({ report }: { report: PDPReport }) {
  const summary = report.product_summary;
  const fixes = report.accuracy_cleanup_fixes ?? [];
  const updates = report.parametric_updates ?? [];
  const blocks = report.recommended_new_content_blocks ?? [];
  const sources = report.sources ?? [];

  return (
    <div className="space-y-4">
      <Section title="1) Product Summary">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div><span className="text-gray-500">Manufacturer:</span> {summary?.manufacturer ?? "N/A"}</div>
          <div><span className="text-gray-500">MPN:</span> {summary?.manufacturer_part_number ?? "N/A"}</div>
          <div><span className="text-gray-500">Product Type:</span> {summary?.product_type ?? "N/A"}</div>
          <div><span className="text-gray-500">Revision Need:</span> {summary?.revision_assessment ?? "N/A"}</div>
        </div>
      </Section>

      <Section title="2) Accuracy / Cleanup Fixes">
        {fixes.length === 0 ? (
          <p className="text-sm text-gray-500">No fixes listed.</p>
        ) : (
          <div className="space-y-3">
            {fixes.map((fix, idx) => (
              <div key={idx} className="border border-gray-100 rounded-md p-3 bg-gray-50 text-sm">
                <p><span className="font-medium">Issue:</span> {fix.current_issue ?? "N/A"}</p>
                <p><span className="font-medium">Correction:</span> {fix.correction ?? "N/A"}</p>
                <p><span className="font-medium">Evidence:</span> {fix.evidence_source ?? "N/A"}</p>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="3) Parametric Updates">
        {updates.length === 0 ? (
          <p className="text-sm text-gray-500">No parametric updates listed.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
              <thead className="bg-gray-100 text-gray-700">
                <tr>
                  <th className="text-left px-3 py-2">Field</th>
                  <th className="text-left px-3 py-2">Current</th>
                  <th className="text-left px-3 py-2">Updated</th>
                  <th className="text-left px-3 py-2">Source</th>
                  <th className="text-left px-3 py-2">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {updates.map((u, idx) => (
                  <tr key={idx} className="border-t border-gray-100">
                    <td className="px-3 py-2">{u.field ?? "N/A"}</td>
                    <td className="px-3 py-2">{u.current_value ?? "N/A"}</td>
                    <td className="px-3 py-2">{u.corrected_or_added_value ?? "N/A"}</td>
                    <td className="px-3 py-2">{u.source ?? "N/A"}</td>
                    <td className="px-3 py-2">{u.confidence ?? "N/A"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="4) Recommended New Content Blocks">
        {blocks.length === 0 ? (
          <p className="text-sm text-gray-500">No new content blocks recommended.</p>
        ) : (
          <div className="space-y-3">
            {blocks.map((block, idx) => {
              if (typeof block === "string") {
                return <p key={idx} className="text-sm">{block}</p>;
              }
              return (
                <div key={idx} className="border border-gray-100 rounded-md p-3 bg-gray-50 text-sm">
                  <p><span className="font-medium">Title:</span> {block.block_title ?? "N/A"}</p>
                  <p><span className="font-medium">Why it helps:</span> {block.why_it_helps ?? "N/A"}</p>
                  <p><span className="font-medium">Source basis:</span> {block.source_basis ?? "N/A"}</p>
                  <p className="mt-1"><span className="font-medium">Proposed copy:</span></p>
                  <p className="whitespace-pre-wrap">{block.proposed_block_copy ?? "N/A"}</p>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section title="5) Revised Overview Copy">
        <p className="text-sm whitespace-pre-wrap">{report.revised_overview_copy ?? "N/A"}</p>
      </Section>

      <Section title="6) Final Publishing Recommendation">
        <p className="text-sm font-medium">{report.final_publishing_recommendation ?? "N/A"}</p>
      </Section>

      <Section title="7) Sources">
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
