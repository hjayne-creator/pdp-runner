import type { ReportDefinition, ReportDefinitionSnapshot } from "../api/types";

function pretty(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function renderScalar(value: unknown) {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value == null) return "N/A";
  return String(value);
}

function KeyValueObject({ value }: { value: Record<string, unknown> }) {
  const entries = Object.entries(value);
  if (entries.length === 0) return <p className="text-sm text-gray-500">No data.</p>;
  return (
    <div className="space-y-2">
      {entries.map(([key, val]) => (
        <div key={key} className="border border-gray-100 rounded-md p-3 bg-gray-50">
          <p className="text-xs font-semibold text-gray-500 mb-1 capitalize">
            {key.replace(/_/g, " ")}
          </p>
          {isPlainObject(val) ? (
            <KeyValueObject value={val} />
          ) : Array.isArray(val) ? (
            <ListValue value={val} />
          ) : (
            <p className="text-sm text-gray-800 whitespace-pre-wrap">{renderScalar(val)}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function ListValue({ value }: { value: unknown[] }) {
  if (value.length === 0) return <p className="text-sm text-gray-500">No items.</p>;
  return (
    <div className="space-y-2">
      {value.map((item, idx) => (
        <div key={idx} className="border border-gray-100 rounded-md p-3 bg-gray-50">
          {isPlainObject(item) ? (
            <KeyValueObject value={item} />
          ) : Array.isArray(item) ? (
            <ListValue value={item} />
          ) : (
            <p className="text-sm text-gray-800 whitespace-pre-wrap">{renderScalar(item)}</p>
          )}
        </div>
      ))}
    </div>
  );
}

export function DynamicReportView({
  definition,
  parsedOutput,
}: {
  definition: ReportDefinitionSnapshot | ReportDefinition;
  parsedOutput: Record<string, unknown>;
}) {
  const sections = (definition.sections ?? [])
    .map((s) => {
      if ("report_section" in s) {
        return {
          key: s.report_section.key,
          label: s.report_section.label,
          position: s.position,
        };
      }
      return s;
    })
    .sort((a, b) => a.position - b.position);
  return (
    <div className="space-y-4">
      {sections.map((section) => {
        const value = parsedOutput[section.key];
        if (value == null) return null;
        return (
          <section key={section.key} className="bg-white border border-gray-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">
              {section.label || section.key}
            </h3>
            {Array.isArray(value) ? (
              <ListValue value={value} />
            ) : isPlainObject(value) ? (
              <KeyValueObject value={value} />
            ) : (
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{String(value)}</p>
            )}
            {(Array.isArray(value) || isPlainObject(value)) && (
              <details className="mt-3">
                <summary className="text-xs text-gray-500 cursor-pointer">View raw JSON</summary>
                <pre className="mt-2 text-xs text-gray-700 whitespace-pre-wrap">{pretty(value)}</pre>
              </details>
            )}
          </section>
        );
      })}
    </div>
  );
}
