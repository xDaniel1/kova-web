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
- [x] Indoor maps: load the nightly plans from kovamaps.com/indoor and draw floors with a floor picker
- [x] Discover / guides shelves (five themes, top-rated nearby places)
- [x] Speed limits and lane data from Overpass on each driving step

## 0.3 Google Maps-style web layout (done)
- [x] Rail, search card, chips, side panel, Layers, bottom sheet on phones
- [x] Results lists, place tabs, route options with traffic, departure times

## Infrastructure
- [x] Replace demo endpoints (Photon, OSRM, OpenFreeMap, Overpass) with Mapbox
- [x] ~~Evaluate MapKit JS~~ decided on Mapbox, matching the iPhone Mapbox edition
- [x] Playwright smoke test in CI against the production build
- [x] Error reporting into `public.client_errors` (insert-only; admins read it)

## U.S. coverage expansion

Tracked in [#24](https://github.com/xDaniel1/kova-web/issues/24).

- [x] Add repeatable capital-city checks for all 50 states and D.C.
- [x] Add one smaller-town sample per state, including Alaska and Hawaii.
- [x] Replace Manhattan-only startup with a U.S. overview and last-area restoration.
- [ ] Validate real street-address pairs, cross-state trips, disconnected-road/ferry cases and rural destinations beyond town centers.
- [ ] Audit cycling and transit separately; missing transit service must not be confused with a broken request.
- [ ] Inventory airport indoor floors and directory contents by venue, with confirmed/partial/unavailable status.
- [ ] Add state-specific browser journeys and checks on physical low-end hardware.

See [the state-by-state results](coverage/README.md). Provider samples are not comprehensive statewide certification.
