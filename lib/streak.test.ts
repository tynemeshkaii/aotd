import assert from 'node:assert/strict';
import test from 'node:test';

// @ts-expect-error Node's strip-types test runner needs the source extension.
import { buildStreakSummary, romanNumeral } from './streak.ts';

test('builds a consecutive run across a month boundary from local pick dates', () => {
  const summary = buildStreakSummary(
    [
      { pick_date: '2026-06-01', status: 'pending' },
      { pick_date: '2026-05-31', status: 'rated' },
      { pick_date: '2026-05-30', status: 'opened' },
    ],
    '2026-06-01',
  );

  assert.equal(summary.consecutiveDays, 3);
  assert.equal(summary.days.at(-1)?.date, '2026-06-01');
  assert.equal(summary.days.at(-1)?.isToday, true);
});

test('does not shift local date strings through the runtime timezone', () => {
  const summary = buildStreakSummary(
    [
      { pick_date: '2026-01-01', status: 'rated' },
      { pick_date: '2025-12-31', status: 'rated' },
    ],
    '2026-01-01',
  );

  assert.equal(summary.consecutiveDays, 2);
  assert.deepEqual(
    summary.days.slice(-2).map((day) => day.date),
    ['2025-12-31', '2026-01-01'],
  );
});

test('uses the server streak as the displayed volume when it is larger', () => {
  const summary = buildStreakSummary(
    [{ pick_date: '2026-06-14', status: 'pending' }],
    '2026-06-14',
    12,
  );

  assert.equal(summary.consecutiveDays, 1);
  assert.equal(summary.volume, 12);
  assert.equal(romanNumeral(summary.volume), 'XII');
});
