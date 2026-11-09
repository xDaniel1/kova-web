# Kova Maps for the web

The browser edition of [Kova Maps](https://kovamaps.com), the iPhone maps app. It lives at **https://app.kovamaps.com** and shares the same account and database as the iOS app, so a place you save on your phone shows up here and the other way round.

The layout follows Google Maps on the web: an icon rail, a floating search box with category chips, a full-height side panel for places and directions, a Layers tile and map controls, and a bottom sheet on phones.

| | iOS app (`waypoint-ios`) | Web (this repo) |
|---|---|---|
| Map | Mapbox (Kova Maps edition) | Mapbox GL JS, Streets / Dark / Satellite, live traffic layer |
| Search | Apple + Google Places | Mapbox Search Box while typing; Google Places for results lists and details |
| Directions | MKDirections / Mapbox, Google Routes | Mapbox Directions (traffic, congestion colours, speed limits, lanes); Google Routes for transit |
| Accounts & sync | Supabase (Kova Tower project) | Same Supabase project, same `sync_snapshots` row |

## What works today

- Search with suggestions as you type, plus category chips (Restaurants, Coffee, Hotels, Gas, EV charging, ...) that list rated places with photos and open hours, pinned on the map
- Click any place on the map, or anywhere to drop a pin
- Place panel: photo gallery, rating, Overview / Reviews / About tabs, Directions, Save, Nearby, Send to phone, Share, hours, website, phone
- Directions for driving, transit, walking and cycling, with the time for each mode, multiple stops, swap, Leave now / Depart at / Arrive by, route options with traffic, and step-by-step details with lane arrows and speed limits
- Routes coloured by live congestion; a Traffic layer, Satellite view and drivers' traffic reports from the Layers tile
- Saved places and recents, synced with the iPhone app when signed in with Google
- Indoor floor plans for published venues, with a floor picker
- Light and dark mode; a bottom sheet layout on phones; shareable URLs for every view

See [ROADMAP.md](ROADMAP.md) for what comes next and the open [issues](https://github.com/xDaniel1/kova-web/issues) for the tracked work.

## How it is built and shipped

- Vite + React 19 + TypeScript, no backend of its own. Everything talks to public services or Supabase from the browser.
- Copy `.env.example` to `.env.local` and set `VITE_MAPBOX_TOKEN` (the build reads it; CI uses the `MAPBOX_TOKEN` repository secret).
- `npm run dev` for a local server, `npm test` for the unit tests, `npm run build` for the static site in `dist/`.
- Every push to `main` runs [`deploy.yml`](.github/workflows/deploy.yml): typecheck, tests, build, then deploy to GitHub Pages. Pull requests build but do not deploy.
- `public/CNAME` tells GitHub Pages the site answers at `app.kovamaps.com`. DNS for `kovamaps.com` is at Cloudflare; the `app` record is a CNAME to `xdaniel1.github.io`.

### Secrets

The browser holds only public keys. `src/lib/config.ts` holds the Supabase project URL and the *publishable* anon key. The Mapbox public token (`pk.`) is injected at build time from the `MAPBOX_TOKEN` secret, so it is not in the repo; restrict it to `https://app.kovamaps.com` in the Mapbox account. The anon key is meant to be public: every table is protected by row-level security, so the key alone can read nothing that is not yours. Never add a service-role key or a paid API key to this repo. Google Places and Google Routes are called from the `google` Edge Function in `supabase/functions/google`, which holds the key as a function secret (`GOOGLE_API_KEY`) and only answers callers that present the publishable key from an allowed origin. Deploy it with `npx supabase functions deploy google --no-verify-jwt --use-api --remote=<project ref>`.

## Related repos

- [`waypoint-ios`](https://github.com/xDaniel1/waypoint-ios): the iPhone app and the Supabase schema (`supabase/schema.sql`)
- [`waypoint-site`](https://github.com/xDaniel1/waypoint-site): kovamaps.com, legal pages, nightly indoor plans
- [`kova-admin`](https://github.com/xDaniel1/kova-admin): Tower, the internal console at tower.kovamaps.com
