# Rural map and place QA — November 11, 2026

## Sample and method

Captured the proposed web build and Google Maps in Chromium at 1280×800, requesting zoom 10, 13 and 16 at each location:

| Location | Coordinates | What was inspected |
|---|---|---|
| Marfa, Texas | 30.3106, -104.0206 | Highways, town grid, ranch/service roads, road refs and surface markings |
| Custer, South Dakota | 43.7666, -103.5988 | Hills/forest, creeks, minor roads and town labels |
| Ely, Minnesota | 47.9032, -91.8671 | Lakes, land cover, street labels, alleys, buildings and POIs |

Nine Kova and nine Google screenshots were captured. Kova captures wait for the map load event (not just a fixed delay or a visible canvas). No script/style errors were recorded. The shared preview timed out twice on capture, so a separate automated Chromium instance was used.

Google and Mapbox nominal zoom values do **not** guarantee identical ground extent; scale bars are visible. These are visual behavior comparisons, not road-count, accuracy or completeness rankings. No ground-truth survey was performed. Screenshots are QA artifacts supplied in the thread, not bundled browser assets or publicly republished Google imagery.

## Observations and changes

- Both providers show regional roads and town labels at the wider views. Google emphasizes a smaller set of prominent roads/POIs; the original Kova minor streets were pale against the land background. Increase low-zoom minor-road contrast and bring minor casing into zoom 12.
- At closer views, preserve the provider's building footprints, local names and county/highway refs. Add collision-managed names/refs for tracks and service roads at zoom 12–15, where the stock road-label layer omits them. Do not force overlapping text.
- Custer shows why terrain should remain visible alongside roads. Retain the existing vector hillshade through zoom 16 with restrained contrast; do not add 3-D terrain, a DEM or another tile source. Water gets a less saturated but distinct fill. Existing land-cover/land-use polygons remain.
- Small-settlement labels stay eligible through zoom 16, subject to the provider's ranking/filter and collision rules.
- A dashed brown overlay applies **only** to roads with an explicit `surface=unpaved` tag. It does not classify unknown surfaces as paved/unpaved and does not alter routing. The map key says “Mapped unpaved roads.” Availability depends on upstream mapping. See [Mapbox Streets v8](https://docs.mapbox.com/data/tilesets/reference/mapbox-streets-v8/).
- Thin place cards keep the original name/address, coordinates, Directions/Save/share and an external coordinate link. They do not synthesize ratings, reviews, hours or photos. Unknown current opening status no longer becomes “Closed.” Failed hero photos show a fallback and detail requests cancel/timeout rather than hang.

## Stability and performance

Style changes run on style load using the existing composite source. No added DEM/source, per-frame polling or terrain mesh. Existing tile/cache/low-spec budgets stay in place. A 4× CPU slowdown run with 2-core/4-GB hints passed rural map load, a pan and search, with no page errors. This is functional evidence, not a frame-rate guarantee or physical budget-laptop certification.

A broader browser run exposed a real search-focus race: a map load/resize changed proximity and remounted a focused suggestion. Proximity is now sampled for a query rather than refetched on every map event. A resize regression passed three repeat runs.

## Release and auth status

PR #27 is merged/deployed at `16b3286`. Live verification read 220 Orlando speed segments, opened MCO Browse without a control intercept, and recorded no uncaught page errors.

A real authenticated Apple-backed session verified own snapshot reads, unfiltered reads limited to that owner, and public venue/speed/Tower reads. A foreign-owner snapshot insert was denied with 403 / 42501 and created no row. These verify the exercised RLS paths, not every policy operation.

The Google flow reached account selection and a fresh-password challenge. No credential was supplied to the secure request. The full Google callback/consent round trip remains blocked by that login step; existing Apple-backed authentication is not a substitute for claiming Google success. Apple web OAuth remains hidden pending upstream provider setup.
