import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import { useSession } from '@/components/auth/AuthProvider';
import { useUserRealtimeInvalidation } from '@/lib/hooks/useUserRealtimeInvalidation';
import { parseAlbumDiscovery, type TodayPick } from '@/lib/recommendation';
import { supabase } from '@/lib/supabase';

const TODAY_KEY = (userId?: string, localDate?: string) =>
  localDate ? ['today-pick', userId, localDate] : ['today-pick', userId];
const TODAY_PICK_REALTIME_TABLES = ['albums_of_the_day'];

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
  const [localDate, setLocalDate] = useState(() => localDateKey());
  const todayKey = useMemo(() => TODAY_KEY(userId, localDate), [userId, localDate]);
  const realtimeKey = useMemo(() => TODAY_KEY(userId), [userId]);

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
      return row ? parseAlbumDiscovery(row) : null;
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

  useUserRealtimeInvalidation({
    channelPrefix: 'today-pick',
    userId,
    tables: TODAY_PICK_REALTIME_TABLES,
    queryKey: realtimeKey,
  });

  return query;
}
