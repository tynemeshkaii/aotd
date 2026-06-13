import { useAccentFlowFocus } from '@/theme/skins/AccentFlowProvider';
import { useSkinComponents } from '@/theme/skins/registry';
import { useSpotifySignIn } from './useSpotifySignIn';

export function SignInController() {
  const components = useSkinComponents();
  useAccentFlowFocus();
  const { loading, handleSignIn } = useSpotifySignIn();

  return <components.SignInView loading={loading} onSignIn={handleSignIn} />;
}
