import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { triggerLibrarySync } from '@/lib/library';
import { supabase } from '@/lib/supabase';

const AUTO_SYNC_STALE_MS = 24 * 60 * 60 * 1000;
// Don't retry a failed sync within this window — Spotify rate limits punish
// rapid retries, and the user can always tap "Sync now" in Profile.
const FAILED_RETRY_COOLDOWN_MS = 15 * 60 * 1000;

async function maybeAutoSync(userId: string) {
  try {
    // 1) Don't fire if a sync is already running OR recently failed.
    const { data: syncRow } = await supabase
      .from('library_sync_status')
      .select('status, started_at, completed_at, updated_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (syncRow) {
      if (syncRow.status === 'queued' || syncRow.status === 'syncing') {
        return;
      }
      if (syncRow.status === 'failed') {
        const lastTouch = syncRow.completed_at ?? syncRow.updated_at;
        if (lastTouch && Date.now() - new Date(lastTouch).getTime() < FAILED_RETRY_COOLDOWN_MS) {
          return;
        }
      }
    }

    // 2) Only fire if library is stale (or never synced).
    const { data: connection } = await supabase
      .from('streaming_connections_safe')
      .select('last_synced_at')
      .eq('provider', 'spotify')
      .maybeSingle();
    if (!connection) return;

    const lastSyncedAt = connection.last_synced_at;
    const stale =
      !lastSyncedAt || Date.now() - new Date(lastSyncedAt).getTime() > AUTO_SYNC_STALE_MS;
    if (!stale) return;

    await triggerLibrarySync();
  } catch (error) {
    if (__DEV__) {
      console.warn('[auto-sync] skipped:', error);
    }
  }
}

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
};

const AuthContext = createContext<AuthContextValue>({
  session: null,
  loading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const autoSyncedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let mounted = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) {
          return;
        }

        setSession(data.session);
      })
      .catch((error: unknown) => {
        if (__DEV__) {
          console.warn('[auth] Failed to restore Supabase session:', error);
        }

        if (mounted) {
          setSession(null);
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Track which userIds we've already auto-synced for in this session — guards
  // against `session` object identity changes refiring the effect.
  useEffect(() => {
    const userId = session?.user.id;
    if (!userId || autoSyncedRef.current.has(userId)) return;
    autoSyncedRef.current.add(userId);
    void maybeAutoSync(userId);
  }, [session?.user.id]);

  const value = useMemo(() => ({ session, loading }), [session, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useSession() {
  return useContext(AuthContext);
}
