# Changelog

## 0.2.0 — unreleased
- Place details from Google: photos, rating, price, hours, phone, website, reviews and a summary
- Transit directions: subway, bus and ferry legs drawn in their line colours with stop names, times and fare
- Discover shelves: Great Coffee, Dinner Tonight, Parks & Outdoors, Nightlife, Arts & Culture
- Speed limit signs and lane arrows on driving steps, from OpenStreetMap
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
