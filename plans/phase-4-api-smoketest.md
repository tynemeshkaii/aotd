# Phase 4 API smoke-test results (YYYY-MM-DD)

> Run `./tests/smoketest-apis.sh <SPOTIFY_TOKEN> <LASTFM_KEY>` and fill in results.

| Endpoint | HTTP | Notes |
|---|---|---|
| Spotify /me/top/tracks       | 200 / 403 | ... |
| Spotify /audio-features      | 200 / 403 | ... |
| Spotify /artists/.../related | 200 / 403 | ... |
| Spotify /search?type=album   | 200       | ... |
| Spotify /me product          | 200       | product: premium/free/open/null |
| Last.fm artist.getsimilar    | 200       | sample similar count: N |
| Last.fm artist.gettopalbums  | 200       | sample topalbums count: N |

## Plan adjustment

- audio-features: AVAILABLE/UNAVAILABLE — documented only; v1 scoring unchanged
- spotify related-artists: AVAILABLE/UNAVAILABLE — algorithm path Y
- ...
