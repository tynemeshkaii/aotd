import { useQuery } from '@tanstack/react-query';

import { useSession } from '@/components/auth/AuthProvider';
import { supabase } from '@/lib/supabase';

export type RecapMonth = {
  month: string;
  issues: number;
};

export const RECAP_MONTHS_KEY = (userId?: string) => ['recap-months', userId];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseRecapMonths(value: unknown): RecapMonth[] {
  if (!Array.isArray(value)) {
    throw new Error('invalid_recap_months_shape');
  }

  return value.map((item) => {
    if (!isRecord(item) || typeof item.month !== 'string' || typeof item.issues !== 'number') {
      throw new Error('invalid_recap_months_shape');
    }
    return { month: item.month, issues: item.issues };
  });
}

export function useRecapMonths() {
  const { session } = useSession();
  const userId = session?.user.id;

  return useQuery({
    queryKey: RECAP_MONTHS_KEY(userId),
    enabled: !!userId,
    queryFn: async (): Promise<RecapMonth[]> => {
      if (!userId) throw new Error('missing_user_id');

      const { data, error } = await supabase.rpc(
        'get_recap_months' as never,
        {
          p_user_id: userId,
        } as never,
      );

      if (error) throw error;
      return parseRecapMonths(data);
    },
  });
}
