import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import { useSession } from '@/components/auth/AuthProvider';
import type { TodayPick } from '@/lib/recommendation';
import { supabase } from '@/lib/supabase';

const TODAY_KEY = (userId?: string, localDate?: string) =>
  localDate ? ['today-pick', userId, localDate] : ['today-pick', userId];

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function msUntilNextLocalMidnight() {
  const now = new Date();
  const nextMidnight = new Date(now);
  nextMidnight.setHours(24, 0, 0, 0);
  return Math.max(nextMidnight.getTime() - now.getTime(), 1_000);
}

export function useTodayPick() {
  const { session } = useSession();
  const userId = session?.user.id;
  const qc = useQueryClient();
  const instanceId = useId();
  const [localDate, setLocalDate] = useState(() => localDateKey());
  const todayKey = useMemo(() => TODAY_KEY(userId, localDate), [userId, localDate]);

  const query = useQuery({
    queryKey: todayKey,
    enabled: !!userId,
    queryFn: async (): Promise<TodayPick | null> => {
      if (!userId) throw new Error('missing_user_id');
      // IMPORTANT: do not detach `supabase.rpc` into a local variable — losing
      // the `this` binding crashes at runtime with
      // "Cannot read property 'rest' of undefined". Always call inline.
      const { data, error } = await supabase.rpc('get_current_pick', {
        p_user_id: userId,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      // The generated RPC return type is looser than TodayPick (nullable
      // columns appear as non-null, status is a free string, selection_reason
      // is Json). Narrow at the boundary.
      return (row ?? null) as TodayPick | null;
    },
  });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const refreshLocalDate = () => {
      setLocalDate((current) => {
        const next = localDateKey();
        return current === next ? current : next;
      });
    };

    const scheduleMidnightRefresh = () => {
      timer = setTimeout(() => {
        refreshLocalDate();
        scheduleMidnightRefresh();
      }, msUntilNextLocalMidnight());
    };

    scheduleMidnightRefresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshLocalDate();
    });

    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`today-pick-${userId}-${instanceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'albums_of_the_day',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: TODAY_KEY(userId) });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, qc, instanceId]);

  return query;
}
