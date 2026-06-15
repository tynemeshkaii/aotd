import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import { Alert } from 'react-native';

import { useSession } from '@/components/auth/AuthProvider';
import { DISCOVERIES_KEY } from '@/lib/hooks/useDiscoveries';
import { DISCOVERY_DETAIL_KEY } from '@/lib/hooks/useDiscoveryDetail';
import { PROFILE_OVERVIEW_KEY } from '@/lib/hooks/useProfileOverview';
import { UNRATED_PAST_PICK_COUNT_PREFIX } from '@/lib/hooks/useUnratedPastPickCount';
import type { RatingScore } from '@/lib/recommendation';
import { supabase } from '@/lib/supabase';

const microcopyKey = (userId: string) => `aotd_rating_microcopy_shown_${userId}`;

async function showRatingMicrocopyOnce(userId: string) {
  try {
    const key = microcopyKey(userId);
    const alreadyShown = await SecureStore.getItemAsync(key);
    if (alreadyShown) return;

    await SecureStore.setItemAsync(key, '1');
    Alert.alert(
      'Saved to your journal',
      "Your library shapes tomorrow's pick, not your ratings — keep saving in Spotify.",
    );
  } catch (error) {
    console.warn('Could not persist rating microcopy flag', error);
  }
}

export function useSaveRating(aotdId: string) {
  const { session } = useSession();
  const userId = session?.user.id;
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ score, comment }: { score: RatingScore; comment: string }) => {
      if (!userId) throw new Error('missing_user_id');
      const { data, error } = await supabase.rpc('save_album_rating', {
        p_user_id: userId,
        p_aotd_id: aotdId,
        p_score: score,
        p_comment: comment,
      });
      if (error) {
        console.warn('Could not save album rating', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });
        throw error;
      }
      return data;
    },
    onSuccess: async () => {
      if (!userId) return;
      qc.invalidateQueries({ queryKey: ['today-pick', userId] });
      qc.invalidateQueries({ queryKey: DISCOVERIES_KEY(userId) });
      qc.invalidateQueries({ queryKey: DISCOVERY_DETAIL_KEY(userId, aotdId) });
      qc.invalidateQueries({ queryKey: UNRATED_PAST_PICK_COUNT_PREFIX(userId) });
      qc.invalidateQueries({ queryKey: PROFILE_OVERVIEW_KEY(userId) });

      await showRatingMicrocopyOnce(userId);
    },
  });
}
