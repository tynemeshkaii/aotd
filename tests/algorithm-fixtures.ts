type UserArtist = {
  spotify_id: string | null;
  name: string;
  frequency: number;
};

type TasteSignal = {
  librarySize: number;
  topArtists: UserArtist[];
  tasteVector: {
    energy: number;
    valence: number;
    danceability: number;
    acousticness: number;
    instrumentalness: number;
    tempo: number;
  } | null;
  libraryDecadeFractions: Record<string, number>;
};

type AlbumCandidate = {
  spotify_id: string;
  mb_release_group_id?: string;
  title: string;
  primary_artist_name: string;
  primary_artist_spotify_id?: string;
  cover_url?: string;
  total_tracks: number;
  duration_ms?: number;
  release_year?: number;
  album_type?: string;
  lastfm_listeners?: number;
  lastfm_playcount?: number;
  best_similarity_match: number;
  source_paths: { source_artist: UserArtist; similar_match: number }[];
};

export const mainstreamTaste: TasteSignal = {
  librarySize: 500,
  topArtists: [
    { spotify_id: 'a1', name: 'Drake', frequency: 25 },
    { spotify_id: 'a2', name: 'Taylor Swift', frequency: 20 },
    { spotify_id: 'a3', name: 'Kendrick Lamar', frequency: 18 },
    { spotify_id: 'a4', name: 'The Weeknd', frequency: 15 },
    { spotify_id: 'a5', name: 'SZA', frequency: 12 },
    { spotify_id: 'a6', name: 'Doja Cat', frequency: 10 },
    { spotify_id: 'a7', name: 'Post Malone', frequency: 9 },
    { spotify_id: 'a8', name: 'Billie Eilish', frequency: 8 },
    { spotify_id: 'a9', name: 'Travis Scott', frequency: 7 },
    { spotify_id: 'a10', name: 'Dua Lipa', frequency: 6 },
    { spotify_id: 'a11', name: 'Ariana Grande', frequency: 5 },
    { spotify_id: 'a12', name: 'Bad Bunny', frequency: 5 },
    { spotify_id: 'a13', name: 'Olivia Rodrigo', frequency: 4 },
    { spotify_id: 'a14', name: 'Harry Styles', frequency: 4 },
    { spotify_id: 'a15', name: 'Lil Nas X', frequency: 3 },
    { spotify_id: 'a16', name: 'Tyler the Creator', frequency: 3 },
    { spotify_id: 'a17', name: 'Beyonce', frequency: 3 },
    { spotify_id: 'a18', name: 'Frank Ocean', frequency: 2 },
    { spotify_id: 'a19', name: 'Kanye West', frequency: 2 },
    { spotify_id: 'a20', name: 'Rihanna', frequency: 2 },
  ],
  tasteVector: {
    energy: 0.7,
    valence: 0.6,
    danceability: 0.65,
    acousticness: 0.2,
    instrumentalness: 0.05,
    tempo: 110,
  },
  libraryDecadeFractions: { '2010': 0.35, '2020': 0.45, '2000': 0.15, '1990': 0.05 },
};

export const undergroundTaste: TasteSignal = {
  librarySize: 800,
  topArtists: [
    { spotify_id: 'd1', name: 'Burzum', frequency: 12 },
    { spotify_id: 'd2', name: 'Aphex Twin', frequency: 30 },
    { spotify_id: 'd3', name: 'Autechre', frequency: 25 },
    { spotify_id: 'd4', name: 'Boards of Canada', frequency: 20 },
    { spotify_id: 'd5', name: 'Coil', frequency: 15 },
    { spotify_id: 'd6', name: 'Current 93', frequency: 12 },
    { spotify_id: 'd7', name: 'Swans', frequency: 10 },
    { spotify_id: 'd8', name: 'Nurse With Wound', frequency: 8 },
    { spotify_id: 'd9', name: 'Lustmord', frequency: 7 },
    { spotify_id: 'd10', name: 'Merzbow', frequency: 6 },
    { spotify_id: 'd11', name: 'Sunn O)))', frequency: 5 },
    { spotify_id: 'd12', name: 'Tim Hecker', frequency: 5 },
    { spotify_id: 'd13', name: 'Fennesz', frequency: 4 },
    { spotify_id: 'd14', name: 'Stars of the Lid', frequency: 4 },
    { spotify_id: 'd15', name: 'Gas', frequency: 3 },
    { spotify_id: 'd16', name: 'Bohren & der Club of Gore', frequency: 3 },
    { spotify_id: 'd17', name: 'Earth', frequency: 3 },
    { spotify_id: 'd18', name: 'Boris', frequency: 2 },
    { spotify_id: 'd19', name: 'Grouper', frequency: 2 },
    { spotify_id: 'd20', name: 'Deathprod', frequency: 2 },
  ],
  tasteVector: {
    energy: 0.4,
    valence: 0.3,
    danceability: 0.4,
    acousticness: 0.3,
    instrumentalness: 0.6,
    tempo: 95,
  },
  libraryDecadeFractions: {
    '1990': 0.3,
    '2000': 0.25,
    '2010': 0.2,
    '2020': 0.15,
    '1980': 0.1,
  },
};

export const tinyLibraryTaste: TasteSignal = {
  librarySize: 6,
  topArtists: [{ spotify_id: null, name: 'Some Artist', frequency: 1 }],
  tasteVector: null,
  libraryDecadeFractions: {},
};

export function makeCandidate(
  opts: Partial<AlbumCandidate> & {
    spotify_id: string;
    primary_artist_name: string;
    best_similarity_match: number;
    source_path_freq: number;
  },
): AlbumCandidate {
  return {
    spotify_id: opts.spotify_id,
    title: opts.title ?? `Album ${opts.spotify_id}`,
    primary_artist_name: opts.primary_artist_name,
    total_tracks: opts.total_tracks ?? 10,
    best_similarity_match: opts.best_similarity_match,
    source_paths: [
      {
        source_artist: {
          spotify_id: 'src',
          name: 'Source',
          frequency: opts.source_path_freq,
        },
        similar_match: opts.best_similarity_match,
      },
    ],
    lastfm_listeners: opts.lastfm_listeners ?? 50000,
    release_year: opts.release_year ?? 2015,
    album_type: 'album',
  };
}
