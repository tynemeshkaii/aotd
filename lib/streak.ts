import type { AlbumDiscovery } from '@/lib/recommendation';

export type StreakDay = {
  date: string;
  status: AlbumDiscovery['status'];
  isToday: boolean;
  opened: boolean;
};

export type StreakSummary = {
  volume: number;
  consecutiveDays: number;
  days: StreakDay[];
};

type DiscoveryInput = Pick<AlbumDiscovery, 'pick_date' | 'status'>;

function dateValue(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return Number.NaN;
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

function fromDateValue(value: number) {
  const date = new Date(value * 86_400_000);
  return date.toISOString().slice(0, 10);
}

export function buildStreakSummary(
  discoveries: DiscoveryInput[],
  todayDate?: string | null,
  serverStreak = 0,
): StreakSummary {
  const byDate = new Map<string, DiscoveryInput>();

  for (const discovery of discoveries) {
    if (!discovery.pick_date || Number.isNaN(dateValue(discovery.pick_date))) continue;
    const current = byDate.get(discovery.pick_date);
    if (!current || current.status !== 'rated') {
      byDate.set(discovery.pick_date, discovery);
    }
  }

  const sortedDates = [...byDate.keys()].sort();
  const anchorDate = todayDate || sortedDates.at(-1) || null;
  const anchorValue = anchorDate ? dateValue(anchorDate) : Number.NaN;

  let consecutiveDays = 0;
  if (!Number.isNaN(anchorValue)) {
    for (let value = anchorValue; value >= anchorValue - 120; value -= 1) {
      if (!byDate.has(fromDateValue(value))) break;
      consecutiveDays += 1;
    }
  }

  const displayEnd = Number.isNaN(anchorValue) ? dateValue(sortedDates.at(-1) ?? '') : anchorValue;
  const days: StreakDay[] = Number.isNaN(displayEnd)
    ? []
    : Array.from({ length: 14 }, (_, index) => {
        const value = displayEnd - (13 - index);
        const date = fromDateValue(value);
        const discovery = byDate.get(date);
        const status = discovery?.status ?? 'pending';
        return {
          date,
          status,
          isToday: date === anchorDate,
          opened: !!discovery && (status === 'opened' || status === 'rated'),
        };
      });

  return {
    volume: Math.max(serverStreak, consecutiveDays),
    consecutiveDays,
    days,
  };
}

export function romanNumeral(value: number) {
  const numerals: [number, string][] = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let remaining = Math.min(3999, Math.max(0, Math.floor(value)));
  let result = '';
  for (const [amount, numeral] of numerals) {
    while (remaining >= amount) {
      result += numeral;
      remaining -= amount;
    }
  }
  return result || '0';
}
