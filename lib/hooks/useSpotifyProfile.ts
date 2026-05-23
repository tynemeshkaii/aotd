import { useQuery } from '@tanstack/react-query';

import { useSession } from '@/components/auth/AuthProvider';
import { getSpotifyProfile } from '@/lib/spotify';

export function useSpotifyProfile() {
  const { session } = useSession();
  const providerToken = session?.provider_token;

  return useQuery({
    queryKey: ['spotify-profile', session?.user.id],
    enabled: !!providerToken,
    queryFn: () => {
      if (!providerToken) {
        throw new Error('missing_provider_token');
      }

      return getSpotifyProfile(providerToken);
    },
  });
}
