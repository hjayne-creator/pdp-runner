import type { ReactNode } from "react";
import type { AiRewriteReport } from "../types/aiRewriteReport";

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
    <ul className="list-disc pl-5 space-y-1 text-sm text-gray-800">
      {items.map((s, i) => (
        <li key={i} className="whitespace-pre-wrap">
          {s}
        </li>
      ))}
    </ul>
  );
}

export function AiRewriteReportView({ report }: { report: AiRewriteReport }) {
  const bullets = report.key_bullets ?? [];
  const assumptions = report.assumptions_or_open_questions ?? [];
  const sources = report.sources ?? [];

  return (
    <div className="space-y-4">
      <Section title="Title">
        <p className="text-sm text-gray-800 whitespace-pre-wrap">
          {report.revised_title?.trim() || <span className="text-gray-400">Not provided</span>}
        </p>
      </Section>

      <Section title="Short description">
        <p className="text-sm text-gray-800 whitespace-pre-wrap">
          {report.revised_short_description?.trim() || (
            <span className="text-gray-400">Not provided</span>
          )}
        </p>
      </Section>

      <Section title="Long description">
        <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
          {report.revised_long_description?.trim() || (
            <span className="text-gray-400">Not provided</span>
          )}
        </p>
      </Section>

      <Section title="Key bullets">
        <StringList items={bullets} empty="No bullets listed." />
      </Section>

      <Section title="SEO notes">
        <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
          {report.seo_notes?.trim() || <span className="text-gray-400">None</span>}
        </p>
      </Section>

      <Section title="Assumptions / open questions">
        <StringList items={assumptions} empty="None listed." />
      </Section>

      <Section title="Sources">
        {sources.length === 0 ? (
          <p className="text-sm text-gray-500">No sources listed.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {sources.map((url, i) => (
              <li key={i}>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-600 hover:underline break-all"
                >
                  {url}
                </a>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
