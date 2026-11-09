# Changelog

## 0.3.0 — 2026-11-09
- Rebuilt around Google Maps' web layout: icon rail (Saved, Recents, Get app), floating search card, category chips, full-height side panel, collapse tab, Layers tile, zoom and locate controls, bottom sheet on phones
- Map moved to Mapbox GL JS (Streets, Dark, Satellite) with a live Traffic layer and clickable map POIs
- Search uses Mapbox Search Box suggestions; category chips and Enter show Google-ranked results with photos, ratings, price and open hours
- Place panel with photo gallery, Overview / Reviews / About tabs and Directions, Save, Nearby, Send to phone, Share
- Directions use Mapbox (live traffic): mode times, route options coloured by congestion, Leave now / Depart at / Arrive by, lane arrows and speed limits in mph
- Replaced the public demo services (Photon, OSRM, OpenFreeMap, Overpass) with Mapbox

## 0.2.0 — unreleased
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
