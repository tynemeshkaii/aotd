import { assert, assertEquals } from 'https://deno.land/std/testing/asserts.ts';

import { parseSyncBody } from './sync-request.ts';

Deno.test('parseSyncBody: empty body → ok, mode undefined (defaults to initial downstream)', () => {
  const result = parseSyncBody('');
  assert(result.ok);
  assertEquals(result.payload.mode, undefined);
});

Deno.test('parseSyncBody: explicit valid modes → ok', () => {
  for (const mode of ['initial', 'bounded', 'full_reconcile'] as const) {
    const result = parseSyncBody(JSON.stringify({ mode }));
    assert(result.ok, `expected ${mode} to be ok`);
    assertEquals(result.payload.mode, mode);
  }
});

Deno.test('parseSyncBody: passes through device_timezone', () => {
  const result = parseSyncBody(JSON.stringify({ mode: 'initial', device_timezone: 'Asia/Tokyo' }));
  assert(result.ok);
  assertEquals(result.payload.device_timezone, 'Asia/Tokyo');
});

Deno.test('parseSyncBody: malformed JSON → invalid_json_body (must not start initial sync)', () => {
  const result = parseSyncBody('not-json');
  assert(!result.ok);
  assertEquals(result.error, 'invalid_json_body');
});

Deno.test('parseSyncBody: non-object JSON → invalid_json_body', () => {
  for (const raw of ['5', '"initial"', 'true', 'null', '["initial"]']) {
    const result = parseSyncBody(raw);
    assert(!result.ok, `expected ${raw} to be rejected`);
    assertEquals(result.error, 'invalid_json_body');
  }
});

Deno.test('parseSyncBody: unknown mode → invalid_sync_mode', () => {
  const result = parseSyncBody(JSON.stringify({ mode: 'turbo' }));
  assert(!result.ok);
  assertEquals(result.error, 'invalid_sync_mode');
});
