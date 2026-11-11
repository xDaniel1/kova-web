# Web / iOS / Tower data contract

Verified against the live project on November 11, 2026. Web changes only; no iOS or Tower repo edits.

Sources reviewed:
- iOS `ios/kova-ios-1.0`: `docs/INDOOR.md`, `supabase/schema.sql`, `supabase/imports/fdot_speed_limits.sql`, `Waypoint/Services/SpeedLimitService.swift`, `VenueDirectory.swift`, `Models/ServiceRegion.swift`.
- Tower: `docs/app-controls-contract.md`, `supabase/admin-v4.sql` and related policy migrations.

## Project and reads

Project: `https://fbumdslhguoytlhlrkyr.supabase.co`. `src/lib/config.ts` contains the public publishable key, which is safe to ship. Mapbox's public token comes from `VITE_MAPBOX_TOKEN` during the build. No service-role credentials are used by the browser.

| Resource | Columns used by web | Access / behavior |
|---|---|---|
| `venues` | `short_name,name` text; `latitude,longitude` float8; `radius_m` integer; `kind` text | Filter `enabled=eq.true`; remote entries override matching bundled names. Auth token when signed in, public key otherwise. Refresh launch/foreground at most once/minute. Empty success clears cached remote entries but keeps bundled defaults. Errors keep last good data. `sources` is import metadata, not geometry. |
| `speed_limit_segments` | `id` bigint; `mph` smallint (5–90); `road,source` text; `path` JSONB `[[lon,lat],...]` | Direct table read, no RPC. `south <= viewport.north AND north >= viewport.south AND west <= viewport.east AND east >= viewport.west`. Deterministic `order=id`, cap 500. Read-only viewport overlay at zoom >=14, opt-in. Cancels old requests. No implied nationwide availability and no nearest-road assignment to routes. |
| `app_config` | `key` text, `value` JSONB | Minimum version, latest, maintenance, features and announcement contract unchanged. Unknown keys ignored. Launch/foreground refresh; fail-safe cached/default controls. |
| `app_messages` | `id,title,body,level,url,created_at` | User/audience visibility is enforced by RLS. Empty is valid. |
| `sync_snapshots` | `user_id` UUID; `favorites,recents` JSONB; `updated_at` timestamptz | Signed-in user's own snapshot, using Supabase SDK session. Missing row is valid. |
| `traffic_reports` | `id,user_id` UUID; `kind` text; `latitude,longitude` float8; `created_at` timestamptz | Signed-in reads/writes per policies, bbox and two-hour window. Empty is valid. |
| `app_message_reads` | `message_id,user_id` UUID | Signed-in acknowledgements only. |
| `rpc/report_client` | `install_id,platform,app_version,build,os_version` | Existing Tower contract; automated browsers do not send install reports. Tested with intercepted requests, not production telemetry writes. |

New state imports can use the same speed table; the overlay does not hard-code Florida. Current observed source is `fdot-maxspeed`, state-road inventory, not every Florida street. `county`, `region`, `source_id` and timestamps are import/provenance metadata, not needed to render the path. An empty or missing table produces no limits, never a fabricated value. The tooltip explains zoom, coverage and the 500-segment cap.

## Indoor plans

`venues` is the venue directory, not floor-plan storage. Airports use `mapbox://mapbox.indoor-v3`; stations/malls use published `https://kovamaps.com/indoor/indoor_<row>_<column>.json`, cell size 0.006 degrees, raw Overpass `elements` shape. No `indoor_cells` table exists in the live schema cache. Web does not use the unreliable public Overpass fallback. Missing CDN cells draw nothing. Tower disabling indoor maps stops new venue/cell work and avoids initial indoor vector source setup.

## Live verification results

From requests carrying `Origin: https://app.kovamaps.com` and the public key:
- `venues` exact web projection: **200**, 25 enabled rows (includes MCO and additional airports).
- Orlando bbox on `speed_limit_segments`: **200**, 500 valid rows, capped as requested.
- `app_config` exact web projection: **200**, 6 rows.
- `app_messages` exact web projection: **200**, empty array (valid).
- Anonymous `sync_snapshots` lookup for a nonexistent user: **200**, empty array.
- Anonymous `traffic_reports` read: **200**, empty array. This alone cannot distinguish no data from policy filtering.
- CORS preflight: **200**; GET responses allow the production origin.
- Supabase Auth settings: Google and Apple enabled. Google `/authorize` starts with **302** to Google, requesting return to `https://app.kovamaps.com/` via Supabase's callback.
- Apple `/authorize`: **400**, `Unsupported provider: missing OAuth secret`. Apple remains hidden in the web UI. Control is handling Services ID/client-secret configuration upstream.

The iOS SQL explicitly allows anon and authenticated reads for venues and speed limits, and limits sync snapshots to the owning auth UUID. Full schema introspection is blocked with the publishable key; no attempt was made to bypass that. A later production check used a real authenticated Apple-backed session: own snapshot read 200/1 row; an unfiltered snapshot read returned only that session owner; the foreign-user lookup returned 200/0 rows; venues, speed limits and Tower config returned 200. A foreign-owner snapshot insert was denied with 403/42501 (row-level security), with no row created. This verifies the exercised ownership/read paths, not every possible RLS operation. The full Google OAuth callback and third-party consent approval remain unverified: Google reached its fresh-password challenge, and the secure credential request received no response. No production control switches, user data or policies were modified for this audit.

## Regression checks

Unit tests cover speed path/types, invalid/empty/missing data, bounded bbox queries, session headers and stale venue removal. Browser tests cover Tower maintenance/minimum/announcements, version reporting and feature gating, plus opt-in posted limits and failure-safe missing tables. CI also exercises Firefox/WebKit and phone/tablet projects. Keep the displayed version and build/commit identifiers.
