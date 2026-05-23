type SpotifyImage = {
  url: string;
  height?: number | null;
  width?: number | null;
};

export type SpotifyProfile = {
  id: string;
  display_name?: string | null;
  images?: SpotifyImage[];
};

export type SpotifyRefreshResult = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
};

export async function fetchSpotifyProfile(accessToken: string) {
  const response = await fetch('https://api.spotify.com/v1/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`spotify_me_failed:${response.status}`);
  }

  return (await response.json()) as SpotifyProfile;
}

export async function refreshSpotifyAccessToken(refreshToken: string) {
  const clientId = Deno.env.get('SPOTIFY_CLIENT_ID');
  const clientSecret = Deno.env.get('SPOTIFY_CLIENT_SECRET');

  if (!clientId || !clientSecret) {
    throw new Error('missing_spotify_credentials');
  }

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    throw new Error(`spotify_refresh_failed:${response.status}`);
  }

  return (await response.json()) as SpotifyRefreshResult;
}
