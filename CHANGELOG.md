# Changelog

## Unreleased

- Read published Supabase speed-limit segments in an opt-in, bounded viewport layer.
- Refresh venue metadata on foreground, clear stale remote rows after an empty success, use session auth, and stop indoor requests when Tower disables the feature.
- Document the shared data contract and live read/OAuth checks; keep broken Apple OAuth hidden pending upstream setup.

- Start new map sessions at a U.S. overview and remember the last map area instead of resetting to Manhattan.
- Add a repeatable 50-state plus D.C. audit for search, driving, walking and nearby places, with explicit untested rural/transit/indoor status.

- Bound map tile caches and indoor cell history; use shorter map effects on modest hardware and respect reduced motion. Coalesce pointer hit tests to one per animation frame and avoid them during map movement.

- Fix a blank map caused by the deferred Mapbox stylesheet overriding the map container position.
- Make search suggestions work with touch and keyboard activation, cancel outdated requests, and explain suggestion failures.
- Add Mapbox airport floor plans, floor selection and a searchable venue directory using the iPhone app's indoor data approach.
- Begin the Kova web styling refresh with teal navigation, a visible wordmark and revised search controls; show the build and commit beside the version.


Kova shares one semantic version across iOS, Android and web. Web releases are tagged `web-vX.Y.Z`; the build number is the GitHub Actions run and the commit is shown next to it (Account menu, Saved, Recents and the rail).

## 1.0.1 — 2026-11-09
Speed and quality pass.
- First load is much lighter: the icon font is cut from 1,085 KB to 18 KB, the map engine loads on its own after the page shell, and the code is split so browsers cache React, Supabase and Mapbox separately
- The search bar and map background paint straight from the HTML; fonts no longer block the first paint
- A service worker caches the app's files, fonts and map glyphs, so repeat visits start fast
- The Layers tile uses a bundled thumbnail instead of a Mapbox image request
- Tests now also run in Firefox, Safari, tablet and phone sizes (`npm run e2e:all`)
- Fix: browsers without WebGL showed a blank page. The app now stays usable and explains why the map is missing
- Added robots.txt; the Layers button's accessible name now matches its label

## 1.0.0 — 2026-11-09
First public release of Kova Maps for the web, aligned with iPhone 1.0.0.
- Kova Tower remote controls: update required, maintenance mode, announcement banner, update nudge, per-user messages, and the sync / traffic reports / indoor maps switches. Fails safe to normal behaviour on any error. Reports its version to Tower (`platform: web`).
- Visible version and build in the app
- Kova branding: logo mark, brand gradient, Kova pin, app icons and install manifest
- Fixes: blank map when the colour scheme changed during load; leftover `#` after sign-in; indoor label font

## 0.3.0 — 2026-11-09 (pre-release)
- Rebuilt around Google Maps' web layout: icon rail (Saved, Recents, Get app), floating search card, category chips, full-height side panel, collapse tab, Layers tile, zoom and locate controls, bottom sheet on phones
- Map moved to Mapbox GL JS (Streets, Dark, Satellite) with a live Traffic layer and clickable map POIs
- Search uses Mapbox Search Box suggestions; category chips and Enter show Google-ranked results with photos, ratings, price and open hours
- Place panel with photo gallery, Overview / Reviews / About tabs and Directions, Save, Nearby, Send to phone, Share
- Directions use Mapbox (live traffic): mode times, route options coloured by congestion, Leave now / Depart at / Arrive by, lane arrows and speed limits in mph
- Replaced the public demo services (Photon, OSRM, OpenFreeMap, Overpass) with Mapbox

## 0.2.0 — 2026-11-09 (pre-release)
- Place details from Google: photos, rating, price, hours, phone, website, reviews and a summary
- Transit directions: subway, bus and ferry legs drawn in their line colours with stop names, times and fare
- Discover shelves: Great Coffee, Dinner Tonight, Parks & Outdoors, Nightlife, Arts & Culture
- Speed limit signs and lane arrows on driving steps, from OpenStreetMap
- Indoor maps for published venues (airports, malls, stations) with a floor picker at street zoom
- Browser error reporting to the Kova Tower database
- The Google key lives in a Supabase Edge Function (`supabase/functions/google`), never in the browser
- Directions between any two places, with "My location" as an option for either end
- Multi-stop routes: add, reorder and remove stops; per-leg step lists
- Alternative routes on two-point trips, selectable in the panel or by clicking the grey line
- Edit a favorite's name, icon and colour; synced to the iPhone app
- Traffic reports: signed-in users see recent Accident / Hazard / Road Closed / Slow Traffic reports in view, can file one by clicking the map, remove their own, and flag others'
- Shareable URLs for a place or a route, browser back/forward, copy-link buttons, Escape to close

## 0.1.0 — 2026-11-09
First deploy of Kova Maps for the web at app.kovamaps.com: map, search, dropped pins, place card, drive / walk / bike directions with a step list, favorites and recents synced with the iPhone app through Supabase sign-in.
