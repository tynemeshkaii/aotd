import { assert, assertEquals } from 'https://deno.land/std/testing/asserts.ts';

import { parseOptionalJsonBody } from './request-body.ts';

Deno.test('parseOptionalJsonBody: empty string → ok, empty object', () => {
  const result = parseOptionalJsonBody('');
  assert(result.ok);
  assertEquals(result.value, {});
});

Deno.test('parseOptionalJsonBody: whitespace-only → ok, empty object', () => {
  const result = parseOptionalJsonBody('   \n\t ');
  assert(result.ok);
  assertEquals(result.value, {});
});

Deno.test('parseOptionalJsonBody: valid JSON object → ok with value', () => {
  const result = parseOptionalJsonBody('{"user_id":"abc","n":3}');
  assert(result.ok);
  assertEquals(result.value, { user_id: 'abc', n: 3 });
});

Deno.test('parseOptionalJsonBody: malformed JSON → not ok', () => {
  assertEquals(parseOptionalJsonBody('not-json').ok, false);
  assertEquals(parseOptionalJsonBody('{"a":').ok, false);
  assertEquals(parseOptionalJsonBody('{').ok, false);
});

Deno.test('parseOptionalJsonBody: valid JSON that is not an object → not ok', () => {
  // Fail closed: a bare number/string/boolean/array/null must not be coerced
  // to {} and run a default code path.
  assertEquals(parseOptionalJsonBody('5').ok, false);
  assertEquals(parseOptionalJsonBody('"hello"').ok, false);
  assertEquals(parseOptionalJsonBody('true').ok, false);
  assertEquals(parseOptionalJsonBody('null').ok, false);
  assertEquals(parseOptionalJsonBody('[1,2,3]').ok, false);
});
