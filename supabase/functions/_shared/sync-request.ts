import { parseOptionalJsonBody } from './request-body.ts';

export type SyncMode = 'initial' | 'bounded' | 'full_reconcile';

export type SyncPayload = {
  mode?: SyncMode;
  device_timezone?: unknown;
};

/**
 * Parse + validate the `sync-spotify-library` request body.
 *
 * Contract:
 *   - empty body            → ok, mode defaults to 'initial' downstream
 *   - malformed JSON / non-object body → invalid_json_body (fail closed; a
 *     malformed body must NOT accidentally start an initial sync)
 *   - unknown `mode` value  → invalid_sync_mode
 *   - mode omitted / initial / bounded / full_reconcile → ok
 */
export type ParseSyncResult =
  | { ok: true; payload: SyncPayload }
  | { ok: false; error: 'invalid_json_body' | 'invalid_sync_mode' };

export function parseSyncBody(rawText: string): ParseSyncResult {
  const parsed = parseOptionalJsonBody(rawText);
  if (!parsed.ok) return { ok: false, error: 'invalid_json_body' };

  const payload = parsed.value as SyncPayload;
  const mode = payload.mode;
  if (mode === undefined || mode === 'initial' || mode === 'bounded' || mode === 'full_reconcile') {
    return { ok: true, payload };
  }
  return { ok: false, error: 'invalid_sync_mode' };
}
