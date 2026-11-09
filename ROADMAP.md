# Roadmap

Status: `[ ]` todo · `[~]` in progress · `[x]` done. Each open item has a GitHub issue.

## 0.1 Foundation (done)
- [x] Vite + React + TypeScript project, GitHub Pages deploy on push to main
- [x] MapLibre map on OpenFreeMap tiles, light/dark, mobile layout
- [x] Search (Photon) and reverse geocode on map click
- [x] Place card: save, directions (drive / walk / bike via OSRM) with step list
- [x] Supabase sign-in (Google, Apple) and favorites/recents sync with the iPhone app

## 0.2 Parity basics
- [ ] Start and end fields in directions (route between any two places, not just from "me")
- [ ] Multi-stop routes
- [ ] Transit directions (needs a provider; the iOS app uses Google Routes)
- [ ] Edit a favorite: custom name, emoji, colour (same fields the iOS app syncs)
- [ ] Shareable URLs: `/place?lat&lng`, `/directions?from&to`, so links open the same view
- [ ] Place details: hours, phone, website, photos (Google Places behind an Edge Function)

## 0.3 Kova features
- [ ] Traffic incident reports layer (read `traffic_reports`, file one when signed in)
- [ ] Indoor maps: load the nightly plans from kovamaps.com/indoor and draw floors
- [ ] Discover / guides shelves
- [ ] Speed limits and lane data from Overpass on the route

## Infrastructure
- [ ] Replace demo endpoints (Photon, OSRM public server) with production ones before promoting beyond beta
- [ ] Evaluate MapKit JS so the web map matches the iOS look (needs an Apple Maps token)
- [ ] Playwright smoke test in CI against the production build
- [ ] Error reporting
