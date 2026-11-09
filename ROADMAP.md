# Roadmap

Status: `[ ]` todo · `[~]` in progress · `[x]` done. Each open item has a GitHub issue.

## 0.1 Foundation (done)
- [x] Vite + React + TypeScript project, GitHub Pages deploy on push to main
- [x] MapLibre map on OpenFreeMap tiles, light/dark, mobile layout
- [x] Search (Photon) and reverse geocode on map click
- [x] Place card: save, directions (drive / walk / bike via OSRM) with step list
- [x] Supabase sign-in (Google, Apple) and favorites/recents sync with the iPhone app

## 0.2 Parity basics
- [x] Start and end fields in directions (route between any two places, not just from "me")
- [x] Multi-stop routes, with reorder and per-leg step lists; alternative routes on two-point trips
- [x] Transit directions via Google Routes through the Edge Function: lines in their colours, stops, times, fare
- [x] Edit a favorite: custom name, emoji, colour (same fields the iOS app syncs)
- [x] Shareable URLs (`?place=`, `?from=&to=&via=&mode=`) with back/forward support and a copy-link button
- [x] Place details: photos, rating, hours, phone, website, reviews (Google Places behind the `google` Edge Function)

## 0.3 Kova features
- [x] Traffic incident reports layer (read `traffic_reports`, file one when signed in, remove yours, flag others')
- [ ] Indoor maps: load the nightly plans from kovamaps.com/indoor and draw floors
- [x] Discover / guides shelves (five themes, top-rated nearby places)
- [x] Speed limits and lane data from Overpass on each driving step

## Infrastructure
- [ ] Replace demo endpoints (Photon, OSRM public server) with production ones before promoting beyond beta
- [ ] Evaluate MapKit JS so the web map matches the iOS look (needs an Apple Maps token)
- [x] Playwright smoke test in CI against the production build
- [x] Error reporting into `public.client_errors` (insert-only; admins read it)
