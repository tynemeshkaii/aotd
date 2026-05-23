export type SpotifyImage = {
  url: string;
  height: number | null;
  width: number | null;
};

export type SpotifyProfile = {
  id: string;
  display_name: string | null;
  images: SpotifyImage[];
};

export async function getSpotifyProfile(accessToken: string) {
  const response = await fetch('https://api.spotify.com/v1/me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`spotify_profile_failed:${response.status}`);
  }

  return (await response.json()) as SpotifyProfile;
}
