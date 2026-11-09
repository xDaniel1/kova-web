# Kova Maps for the web

The browser edition of [Kova Maps](https://kovamaps.com), the iPhone maps app. It lives at **https://app.kovamaps.com** and shares the same account and database as the iOS app, so a place you save on your phone shows up here and the other way round.

| | iOS app (`waypoint-ios`) | Web (this repo) |
|---|---|---|
| Map | Apple MapKit | MapLibre GL with OpenFreeMap vector tiles |
| Search | Apple + Google Places | Photon (OpenStreetMap) for typing, Google Places for details |
| Directions | MKDirections, Google Routes | OSRM (drive / walk / bike), Google Routes (transit) |
| Accounts & sync | Supabase (Kova Tower project) | Same Supabase project, same `sync_snapshots` row |

## What works today

- Map with search, autocomplete-as-you-type, drop a pin by clicking
- Place card with Save (favorite) and Drive / Walk / Bike directions from your location
- Turn-by-turn step list with distance, duration and arrival time
- Favorites and recents, kept on the device, and synced to your account once you sign in with Google or Apple. Same data the iPhone app uses.
- Place details from Google: photos, rating, hours, phone, website, reviews
- Transit directions with lines in their colours, stop names, times and fare
- Discover shelves of top-rated nearby places
- Speed limits and lane arrows on driving steps (OpenStreetMap)
- Traffic incident reports shared with the iPhone app
- Light and dark mode, works on phone-width screens

See [ROADMAP.md](ROADMAP.md) for what comes next and the open [issues](https://github.com/xDaniel1/kova-web/issues) for the tracked work.

## How it is built and shipped

- Vite + React 19 + TypeScript, no backend of its own. Everything talks to public services or Supabase from the browser.
- `npm run dev` for a local server, `npm test` for the unit tests, `npm run build` for the static site in `dist/`.
- Every push to `main` runs [`deploy.yml`](.github/workflows/deploy.yml): typecheck, tests, build, then deploy to GitHub Pages. Pull requests build but do not deploy.
- `public/CNAME` tells GitHub Pages the site answers at `app.kovamaps.com`. DNS for `kovamaps.com` is at Cloudflare; the `app` record is a CNAME to `xdaniel1.github.io`.

### Secrets

The browser holds none. `src/lib/config.ts` holds the Supabase project URL and the *publishable* anon key, which is meant to be public: every table is protected by row-level security, so the key alone can read nothing that is not yours. Never add a service-role key or a paid API key to this repo. Google Places and Google Routes are called from the `google` Edge Function in `supabase/functions/google`, which holds the key as a function secret (`GOOGLE_API_KEY`) and only answers callers that present the publishable key from an allowed origin. Deploy it with `npx supabase functions deploy google --no-verify-jwt --use-api --remote=<project ref>`.

## Related repos

- [`waypoint-ios`](https://github.com/xDaniel1/waypoint-ios): the iPhone app and the Supabase schema (`supabase/schema.sql`)
- [`waypoint-site`](https://github.com/xDaniel1/waypoint-site): kovamaps.com, legal pages, nightly indoor plans
- [`kova-admin`](https://github.com/xDaniel1/kova-admin): Tower, the internal console at tower.kovamaps.com
