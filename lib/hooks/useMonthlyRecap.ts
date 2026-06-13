import { useQuery } from '@tanstack/react-query';

import { useSession } from '@/components/auth/AuthProvider';
import type { AotdStatus, RatingScore } from '@/lib/recommendation';
import { supabase } from '@/lib/supabase';

export type RecapTopFinding = {
  aotd_id: string;
  issue_number: number;
  pick_date: string;
  status: AotdStatus;
  album_title: string;
  album_primary_artist_name: string;
  album_cover_url: string | null;
  album_spotify_id: string;
  rating_score: RatingScore;
};

export type MonthlyRecap = {
  month: string;
  issues_count: number;
  opened_count: number;
  rated_count: number;
  rating_spread: Record<'1' | '2' | '3' | '4' | '5', number>;
  avg_score: number | null;
  top_finding: RecapTopFinding | null;
  span_min: number | null;
  span_max: number | null;
};

export const MONTHLY_RECAP_KEY = (userId?: string, month?: string) => [
  'monthly-recap',
  userId,
  month,
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRatingScore(value: unknown): value is RatingScore {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5;
}

function isStatus(value: unknown): value is AotdStatus {
  return value === 'pending' || value === 'opened' || value === 'rated';
}

function parseTopFinding(value: unknown): RecapTopFinding | null {
  if (value === null) return null;
  if (
    !isRecord(value) ||
    typeof value.aotd_id !== 'string' ||
    typeof value.issue_number !== 'number' ||
    typeof value.pick_date !== 'string' ||
    !isStatus(value.status) ||
    typeof value.album_title !== 'string' ||
    typeof value.album_primary_artist_name !== 'string' ||
    !(value.album_cover_url === null || typeof value.album_cover_url === 'string') ||
    typeof value.album_spotify_id !== 'string' ||
    !isRatingScore(value.rating_score)
  ) {
    throw new Error('invalid_monthly_recap_shape');
  }
  return {
    aotd_id: value.aotd_id,
    issue_number: value.issue_number,
    pick_date: value.pick_date,
    status: value.status,
    album_title: value.album_title,
    album_primary_artist_name: value.album_primary_artist_name,
    album_cover_url: value.album_cover_url,
    album_spotify_id: value.album_spotify_id,
    rating_score: value.rating_score,
  };
}

function parseSpread(value: unknown): MonthlyRecap['rating_spread'] {
  if (!isRecord(value)) throw new Error('invalid_monthly_recap_shape');
  const spread = {
    '1': value['1'],
    '2': value['2'],
    '3': value['3'],
    '4': value['4'],
    '5': value['5'],
  };
  if (!Object.values(spread).every((count) => typeof count === 'number')) {
    throw new Error('invalid_monthly_recap_shape');
  }
  return spread as MonthlyRecap['rating_spread'];
}

function parseMonthlyRecap(value: unknown): MonthlyRecap {
  if (!isRecord(value)) throw new Error('invalid_monthly_recap_shape');
  if (
    typeof value.month !== 'string' ||
    typeof value.issues_count !== 'number' ||
    typeof value.opened_count !== 'number' ||
    typeof value.rated_count !== 'number' ||
    !(value.avg_score === null || typeof value.avg_score === 'number') ||
    !(value.span_min === null || typeof value.span_min === 'number') ||
    !(value.span_max === null || typeof value.span_max === 'number')
  ) {
    throw new Error('invalid_monthly_recap_shape');
  }

  return {
    month: value.month,
    issues_count: value.issues_count,
    opened_count: value.opened_count,
    rated_count: value.rated_count,
    rating_spread: parseSpread(value.rating_spread),
    avg_score: value.avg_score,
    top_finding: parseTopFinding(value.top_finding),
    span_min: value.span_min,
    span_max: value.span_max,
  };
}

export function useMonthlyRecap(month?: string | null) {
  const { session } = useSession();
  const userId = session?.user.id;
  const normalizedMonth = month ?? undefined;

  return useQuery({
    queryKey: MONTHLY_RECAP_KEY(userId, normalizedMonth),
    enabled: !!userId && !!normalizedMonth,
    queryFn: async (): Promise<MonthlyRecap> => {
      if (!userId || !normalizedMonth) throw new Error('missing_monthly_recap_args');

      const { data, error } = await supabase.rpc(
        'get_monthly_recap' as never,
        {
          p_user_id: userId,
          p_month: normalizedMonth,
        } as never,
      );

      if (error) throw error;
      return parseMonthlyRecap(data);
    },
  });
}
