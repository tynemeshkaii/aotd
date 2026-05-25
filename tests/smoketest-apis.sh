#!/usr/bin/env bash
set -e

SPOTIFY_TOKEN="$1"
LASTFM_KEY="$2"

if [ -z "$SPOTIFY_TOKEN" ] || [ -z "$LASTFM_KEY" ]; then
  echo "Usage: ./tests/smoketest-apis.sh <SPOTIFY_TOKEN> <LASTFM_KEY>"
  exit 1
fi

echo "=== Spotify /me/top/tracks ==="
curl -sS -o /tmp/top-tracks.json -w "HTTP %{http_code}\n" \
  -H "Authorization: Bearer $SPOTIFY_TOKEN" \
  "https://api.spotify.com/v1/me/top/tracks?limit=5&time_range=medium_term"

TRACK_ID=$(jq -r '.items[0].id // empty' /tmp/top-tracks.json)

echo "=== Spotify /audio-features ==="
curl -sS -o /tmp/audio.json -w "HTTP %{http_code}\n" \
  -H "Authorization: Bearer $SPOTIFY_TOKEN" \
  "https://api.spotify.com/v1/audio-features?ids=$TRACK_ID"

ARTIST_ID=$(jq -r '.items[0].artists[0].id // empty' /tmp/top-tracks.json)

echo "=== Spotify /artists/{id}/related-artists ==="
curl -sS -o /tmp/related.json -w "HTTP %{http_code}\n" \
  -H "Authorization: Bearer $SPOTIFY_TOKEN" \
  "https://api.spotify.com/v1/artists/$ARTIST_ID/related-artists"

echo "=== Spotify /search?type=album ==="
curl -sS -o /tmp/search.json -w "HTTP %{http_code}\n" \
  -H "Authorization: Bearer $SPOTIFY_TOKEN" \
  "https://api.spotify.com/v1/search?type=album&limit=1&q=Selected%20Ambient%20Works%20Aphex%20Twin"

echo "=== Spotify /me product ==="
curl -sS -o /tmp/me.json -w "HTTP %{http_code}\n" \
  -H "Authorization: Bearer $SPOTIFY_TOKEN" \
  "https://api.spotify.com/v1/me"
echo "product: $(jq -r '.product // "null"' /tmp/me.json)"

echo "=== Last.fm artist.getsimilar ==="
curl -sS -o /tmp/lfm-similar.json -w "HTTP %{http_code}\n" \
  "https://ws.audioscrobbler.com/2.0/?method=artist.getsimilar&artist=Aphex%20Twin&api_key=$LASTFM_KEY&format=json"
echo "similar count: $(jq '.similarartists.artist | length' /tmp/lfm-similar.json)"

echo "=== Last.fm artist.gettopalbums ==="
curl -sS -o /tmp/lfm-topalbums.json -w "HTTP %{http_code}\n" \
  "https://ws.audioscrobbler.com/2.0/?method=artist.gettopalbums&artist=Aphex%20Twin&api_key=$LASTFM_KEY&format=json&limit=5"
echo "topalbums count: $(jq '.topalbums.album | length' /tmp/lfm-topalbums.json)"

echo ""
echo "=== Done. Fill results into plans/phase-4-api-smoketest.md ==="
