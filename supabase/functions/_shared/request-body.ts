/**
 * Shared, side-effect-free request body parsing for Edge Functions whose JSON
 * body is optional (auth is validated separately).
 *
 * Contract — fail closed:
 *   - empty / whitespace-only body  → ok, value = {}
 *   - valid JSON object             → ok, value = the object
 *   - malformed JSON                → not ok (caller returns 400 invalid_json_body)
 *   - valid JSON that is NOT an object (array / number / string / boolean / null)
 *                                   → not ok
 *
 * The non-object rejection matters: `JSON.parse('5')` succeeds and yields a
 * number, which would otherwise be treated as `{}` and could silently run a
 * default code path (e.g. sync mode='initial'). For functions with
 * verify_jwt=false where auth is checked by hand, a malformed body must fail
 * closed rather than fall through to a default.
 */
export type OptionalJsonResult = { ok: true; value: Record<string, unknown> } | { ok: false };

export function parseOptionalJsonBody(rawText: string): OptionalJsonResult {
  const trimmed = rawText.trim();
  if (!trimmed) return { ok: true, value: {} };

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false };
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false };
  }

  return { ok: true, value: parsed as Record<string, unknown> };
}
