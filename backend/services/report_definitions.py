import json
from typing import Any

import models


def build_definition_snapshot(definition: models.ReportDefinition | None) -> dict[str, Any] | None:
    if not definition:
        return None
    sections = []
    for link in sorted(definition.sections, key=lambda x: x.position):
        sec = link.report_section
        if not sec:
            continue
        sections.append(
            {
                "id": sec.id,
                "key": sec.key,
                "label": sec.label,
                "description": sec.description,
                "schema_json": sec.schema_json or {},
                "ui_renderer_key": sec.ui_renderer_key or "generic",
                "position": link.position,
            }
        )
    return {
        "id": definition.id,
        "key": definition.key,
        "name": definition.name,
        "description": definition.description,
        "version": definition.version,
        "sections": sections,
    }


def build_contract_from_snapshot(snapshot: dict[str, Any] | None) -> str:
    if not snapshot:
        return ""
    body: dict[str, Any] = {}
    for section in snapshot.get("sections") or []:
        key = section.get("key")
        if not key:
            continue
        body[key] = section.get("schema_json") or {}
    pretty = json.dumps(body, indent=2, ensure_ascii=True)
    return (
        "=== OUTPUT CONTRACT ===\n"
        "Return ONLY valid JSON (no markdown fences, no extra prose) with this exact shape:\n"
        f"{pretty}\n"
        "=== END OUTPUT CONTRACT ==="
    )


def extract_json_block(text: str) -> str | None:
    trimmed = (text or "").strip()
    if not trimmed:
        return None
    if trimmed.startswith("{") and trimmed.endswith("}"):
        return trimmed

    fence_start = trimmed.find("```")
    if fence_start >= 0:
        fence_end = trimmed.find("```", fence_start + 3)
        if fence_end > fence_start:
            candidate = trimmed[fence_start + 3 : fence_end].strip()
            if candidate.startswith("json"):
                candidate = candidate[4:].strip()
            if candidate.startswith("{") and candidate.endswith("}"):
                return candidate

    first = trimmed.find("{")
    last = trimmed.rfind("}")
    if first >= 0 and last > first:
        return trimmed[first : last + 1]
    return None


def parse_output_with_warnings(
    output: str, definition_snapshot: dict[str, Any] | None
) -> list[str]:
    warnings: list[str] = []
    expected = {s.get("key") for s in (definition_snapshot or {}).get("sections", []) if s.get("key")}
    if not output or not expected:
        return warnings

    json_block = extract_json_block(output)
    if not json_block:
        warnings.append("Could not locate a JSON object in model output.")
        return warnings
    if json_block.strip() != output.strip():
        warnings.append("Model output included extra non-JSON text; JSON block was extracted.")

    try:
        parsed = json.loads(json_block)
    except Exception:
        warnings.append("Extracted JSON block was invalid JSON.")
        return warnings

    if not isinstance(parsed, dict):
        warnings.append("Model output JSON root is not an object.")
        return warnings

    got = set(parsed.keys())
    unknown = sorted(got - expected)
    missing = sorted(expected - got)
    if unknown:
        warnings.append(f"Unknown top-level keys returned: {', '.join(unknown)}")
    if missing:
        warnings.append(f"Configured sections missing from output: {', '.join(missing)}")
    return warnings


def _default_value_for_section(section: dict[str, Any]) -> Any:
    schema = section.get("schema_json") or {}
    if isinstance(schema, dict) and "type" in schema:
        t = schema.get("type")
        if t == "array":
            return []
        if t == "object":
            return {}
        if t == "number":
            return 0
        if t == "boolean":
            return False
        return ""
    ui_key = section.get("ui_renderer_key")
    if ui_key == "list":
        return []
    if ui_key == "object":
        return {}
    if ui_key == "number":
        return 0
    return ""


def build_blocked_payload(
    definition_snapshot: dict[str, Any] | None, reason: str
) -> dict[str, Any]:
    if not definition_snapshot:
        return {"error": reason}
    payload: dict[str, Any] = {}
    for section in definition_snapshot.get("sections") or []:
        key = section.get("key")
        if not key:
            continue
        payload[key] = _default_value_for_section(section)
    if "executive_summary" in payload:
        payload["executive_summary"] = (
            "Unable to generate a complete report because the PDP could not be loaded."
        )
    if "sources" in payload:
        payload["sources"] = []
    return payload
