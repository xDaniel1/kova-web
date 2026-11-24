# Changelog

## 1.0.11 — 2026-11-24

Syncs with iPhone build 77.

- **Cameras and tolls on a drive, like iPhone.** A driving route lists and marks speed, red-light and average-speed cameras, toll gantries and plazas, in route order with the distance to each, and draws traffic lights and stop signs on the route. The data is OpenStreetMap only, read from the public Overpass servers: where OSM has nothing, nothing is shown. Each stretch is kept for a week (up to two months when the servers are busy).
- NYC DOT traffic cameras beside the route, with their live picture. These are drawn on the map, never warned about.
- When the map-data servers are down the panel says the route could not be checked instead of showing nothing. A server that never answers is skipped after 15 s, and after two stretches in a row fail the rest of the route uses only what is cached.

## 1.0.10 — 2026-11-22

Syncs with iPhone (waypoint-ios PR #34).

- **Photo tabs on the place page, like iPhone.** A place's photos get All / Menu / Food & drink / Atmosphere tabs, and photos of the menu get their own Menu row above them. Google doesn't label photos, so the browser sorts them itself with a small image classifier (MobileNet v2, 16-bit, 3.9 MB, served with the app and kept by the service worker after the first download). Nothing is uploaded. Tabs only appear for categories that have photos; a photo the sorter isn't sure about stays under All. Sorting is skipped on a Save-Data connection. iPhone reads menus from the text in the photo; the web uses the classifier's own menu class, set high enough that a tray of food laid out in a grid isn't taken for a menu.
- Indoor: Penn Station, Grand Central and other relation-mapped stations and terminals get their name on the map, inside the largest outline. A courtyard that shares part of the outer wall is cut out instead of dropped. A cell's snapshot time must be a real date. A cell that comes back as something else (a Wi-Fi sign-in page) is skipped for a minute instead of until reload.

## 1.0.9 — 2026-11-22

Syncs with iPhone build 76.

- Indoor maps: stations and terminals mapped as multipolygons (Penn Station, Grand Central and others) draw their outlines. A member with a blank role now counts as outline (Penn Station), as on iPhone. Outlines are the outer boundary of the relation's ways, found edge by edge, so member order doesn't matter: stray ways, links between outlines and chords across a shape are left out (where they share points with the outline; lines crossing without one are invalid data and may still draw oddly, but never twice), outlines touching at one point stay separate, outlines sharing a wall draw as their joint outline (even when the wall has extra points in one copy), inner members (courtyards, atriums) are cut out as holes of the innermost outline holding them (a hole crossing its outline is left out), and shapes with no area are skipped. A point OpenStreetMap couldn't place no longer drops the whole cell. A station or terminal near a cell edge, which every neighbouring cell carries, is drawn and listed once, taken whole from one cell so two versions never mix: the one most recently confirmed against OpenStreetMap (site 1.1.1 cells record it). Something deleted from OpenStreetMap can still show from a neighbouring cell until that cell next refreshes (normally within 14 days). A cell that isn't a valid cell is remembered as empty instead of fetched on every move; a download cut off midway is tried again. Checked on live cells: JFK Terminal 5, Penn Station, Times Square and O'Hare Terminals 1 and 3 all draw. Unlike iPhone, which drops a relation chain whose ends don't meet, the web keeps any complete outline inside it. Needs waypoint-site 1.1.1, whose nightly build now asks OpenStreetMap for relation members; they came back as tags only. Airports with Mapbox plans (JFK and the other ten) keep drawing Mapbox's plan, as on iPhone.

## 1.0.8 — 2026-11-14

- Trees are read from `tiles.kovamaps.com` (Cloudflare R2) first, as on iPhone, now that the `kova-tiles` bucket allows GET from app.kovamaps.com and kovamaps.com. This costs no database time. The database stays the fallback for tiles without a file, and for local and CI builds, whose origins the bucket does not allow.

## 1.0.7 — 2026-11-14

- **Kova's own 3D trees, as on iPhone (builds 19–20).** Mapbox only stands a tree where OpenStreetMap maps one, so woods and leafy streets drew as flat green. The web now reads `tree_cover_tiles` and plants trees around the middle of the map from zoom 15. Single trees stand at their measured spots and heights (1 m canopy height map); elsewhere trees are scattered over satellite tree cover. Each tree is a trunk, a six-sided crown and a cap. The planting hash matches iPhone bit for bit (checked against Swift), so both apps grow the same trees. Florida and New York today; the rest of the US answers "no trees" once per session.
- Trees honour Tower's `features.map_trees` switch (now in `config_keys`) and are off on satellite.
- Tiles are read from `tiles.kovamaps.com` first, like iPhone, and from the database when the file host is unavailable. The file host doesn't allow browser requests yet (no CORS header), so the web reads the database for now (`TREE_FILES_ENABLED` in `src/lib/trees.ts` turns the files on once Cloudflare allows it).

## 1.0.6 — 2026-11-14

Catches the web up with iPhone builds 11–20 and the new database tables.

- **The iPhone's map.** Mapbox Standard with the iPhone's settings (CarPlayMapStyle): 3D buildings, landmarks and trees, gold motorways and trunks, day or night light from the system appearance without reloading. Satellite uses Standard Satellite. A 2D/3D button tilts the map and is remembered, like the iPhone Map View setting.
- Routes in Kova teal. Our layers (routes, traffic, indoor plans, transit, speed limits) sit in Standard's slots under the map's names; clicking a place uses Standard's place data. Classic-style tweaks still apply if a classic style is ever loaded.
- **Transit from our database.** A Transit layer draws rail lines, stations and street-level bus stops for Florida's 23 agencies from `transit_lines` and `transit_stops`, asked for in fixed squares as iPhone's TransitNetwork does. Honours Tower's `transit` switch.
- **Speed limits like iPhone.** Posted limits come from `speed_limits_in_box` (state and city records first, then the federal highway inventory for the whole US). Federal estimates are drawn dashed and lighter.
- **Fewer photo sizes.** Photos are requested at iPhone's three widths (400, 800, 1600), so the same photo is cached at fewer sizes.

## 1.0.5 — 2026-11-12

- Kova's own look instead of a Google Maps layout, matching the iPhone app's Brand palette: teal accent, coral selection, rounded-square tiles instead of pills and circles.
- The dark side rail is gone. Saved, Recents and six categories sit under the search box; the side panel floats as a card.
- Kite-shaped pins (teal for results, coral for the selected place), matching the iPhone position marker.
- New visitors open on New York City instead of a world view. An empty search offers starting ideas (JFK Terminal 4, coffee, EV charging).
- Posted limits and the version label moved into the Layers menu; the unpaved-road key shows only when zoomed in on larger screens. The Layers menu stays open while the pointer crosses into it.

## 1.0.4 — 2026-11-12

- Display and edit Home/Work favorites using the iOS role contract. Assigning a role moves it from its previous holder; Other clears it. Saved lists Home and Work first and preserves existing customizations.


## 1.0.3 — 2026-11-12

- Level with iOS builds 7-10: venues with no floor plan (theme parks, malls, stations, districts and airports Mapbox does not map) get a Browse list and their places named on the map, from the map's own tiles. Rides and shows get a "Rides & Attractions" category. 66 of the 68 Florida venues now list places (was 10).
- At storefront zoom every street names its shops, cafés and attractions.
- Honour Tower's place_labels and rural_detail switches.
- Check-ins send channel (production only from the deploy-on-main build; test from CI; dev locally) and config_keys, per Tower's contract.

## 1.0.2 — 2026-11-11

- Honor Tower web platform overrides and extended speed, traffic, transit and voice switches; default missing switches on, gate provider work and test override precedence.

- Release compatibility audit: support iOS Speed Trap reports, use text-only report popups, revoke deferred sync on sign-out/control changes, and omit query/fragment from error URLs.

- Restore Apple web sign-in alongside Google after the provider configuration was repaired. Show sign-in startup errors inline and keep the version visible.
- Improve minor-road contrast, named local-road labels, small-town labels, terrain/water contrast and explicitly mapped unpaved surfaces without new tile sources.
- Make thin place details and failed photos usable; do not label unknown opening status as closed. Abort stale/stalled place detail requests.
- Preserve focused search suggestions during map load/resize instead of reissuing proximity requests.

- Keep the posted-speed control above Layers so it cannot block airport Browse buttons.
- Retry the posted-speed layer once the map becomes idle if tile/style loading delayed its initial request; no extra pan is required.

- Read published Supabase speed-limit segments in an opt-in, bounded viewport layer.
- Refresh venue metadata on foreground, clear stale remote rows after an empty success, use session auth, and stop indoor requests when Tower disables the feature.
- Document the shared data contract and live read/OAuth checks; restore Apple OAuth after upstream provider setup.

- Start new map sessions at a U.S. overview and remember the last map area instead of resetting to Manhattan.
- Add a repeatable 50-state plus D.C. audit for search, driving, walking and nearby places, with explicit untested rural/transit/indoor status.

- Bound map tile caches and indoor cell history; use shorter map effects on modest hardware and respect reduced motion. Coalesce pointer hit tests to one per animation frame and avoid them during map movement.

- Fix a blank map caused by the deferred Mapbox stylesheet overriding the map container position.
- Make search suggestions work with touch and keyboard activation, cancel outdated requests, and explain suggestion failures.
- Add Mapbox airport floor plans, floor selection and a searchable venue directory using the iPhone app's indoor data approach.
- Begin the Kova web styling refresh with teal navigation, a visible wordmark and revised search controls; show the build and commit beside the version.


Kova platforms share major.minor (currently 1.0); each platform maintains its own patch and increasing build counter. Web releases are tagged `web-vX.Y.Z`; the build number is the GitHub Actions run and the commit is shown next to it (Account menu, Saved, Recents and the rail).

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
