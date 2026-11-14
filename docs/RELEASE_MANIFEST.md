# Web release manifest — November 12, 2026

Status: **1.0.7 candidate** — Kova 3D trees (iPhone builds 19–20 parity). 1.0.5 and 1.0.6 are live and tagged.

## Source and deployment

- Current main: `81b0edf515485525e8ba0d1bc5abf434cd90d9fe` (merged PR #31).
- Last verified production release: **1.0.3 build 45**, commit `81b0edf`. Deployment [43241930545](https://github.com/xDaniel1/kova-web/actions/runs/43241930545) passed. Previous session verified version/commit in served assets. This candidate has not changed production.
- Tags `web-v1.0.1`, `web-v1.0.2`, `web-v1.0.3` are historical releases and must not move.
- Platforms share major.minor 1.0; patch and build counters are per platform. Candidate package/lockfile version: 1.0.7.
- PR #29 shipped Apple provider selection and extended Tower controls. PR #31 shipped venue POIs without floor plans, street labels, `place_labels`/`rural_detail`, and check-in `channel`/`config_keys`. Full Google/Apple login remains unverified and assigned to Daniel, explicitly not a tag blocker.
- Candidate closes issue #30: display/edit/clear Home/Work, move a role from its previous holder, show Home and Work first in Saved, preserve JSON fields and customizations. No database migration or iOS/Tower changes.

## Supabase contract inventory

Project `fbumdslhguoytlhlrkyr`. Browser uses the public publishable key and the authenticated SDK session where available; no service-role key. Detailed live results and source references: [SUPABASE.md](SUPABASE.md).

| Resource | Web columns / operations |
|---|---|
| `sync_snapshots` | Read `favorites,recents,updated_at`, filter `user_id`; upsert `user_id` UUID, `favorites,recents` JSONB, `updated_at` timestamptz. No delete. |
| `traffic_reports` | Read `id,user_id` UUID, `kind` text, `latitude,longitude` numeric, `created_at` timestamptz. Two-hour bbox, newest first, cap 200. Insert `user_id,kind,latitude,longitude`; delete by `id`. Candidate supports all five iOS kinds including `Speed Trap`; unknown/malformed rows ignored. |
| `traffic_report_flags` | Insert `report_id,flagged_by` UUID. Tower-owned extension, not an iOS schema mismatch. |
| `venues` | Read `short_name,name,latitude,longitude,radius_m,kind`; filter `enabled=true`. Text names/kind, float8 coordinates, integer radius. No writes. Remote directory supplements bundled venues; successful empty response removes stale remote rows. |
| `speed_limit_segments` | Read `id` bigint, `mph` smallint, `road,source` text, `path` JSONB coordinate pairs. Filter overlap on numeric `south,north,west,east`, order `id`, cap 500. No writes/RPC. Same bbox contract as iOS. `county,region,source_id,updated_at` import metadata not consumed. |
| `app_config` | Read `key` text, `value` JSONB; keys below. No writes. |
| `app_messages` | Read `id,title,body,level,url,created_at`, cap 20; audience filtering belongs to RLS. No writes. |
| `app_message_reads` | Insert `message_id,user_id` UUID for signed-in acknowledgement. |
| `client_errors` | Insert `app='web',message,stack,url,user_agent,user_id`; nullable stack/user UUID. Candidate strips URL query/fragment from telemetry. No reads. |
| `rpc/report_client` | POST `install_id` UUID, `platform='web'`, `app_version`, `build`, `os_version`. Tower function owns underlying `app_clients` write; browser never directly reads/writes `app_clients`. Automated browsers skip reporting. |

No other direct application-table access or SQL RPC is present. Supabase Auth uses its SDK endpoints. Google places/transit/photo requests use the existing `google` Edge Function, not direct database tables. Airport floor plans use Mapbox indoor vector tiles; mall/station cells use the published kovamaps.com indoor JSON CDN, not a nonexistent `indoor_cells` table. Missing plans render no invented geometry.

Snapshot JSON: favorites use `id,title,subtitle,latitude,longitude,customTitle?,emoji?,colorHex?`; recents use `id,title,subtitle,latitude,longitude,date`. iOS additionally supports optional favorite `role` (home/work). Candidate adds this UI/type, matching iOS uniqueness semantics and preserving extra JSON fields when editing. Last-writer-wins snapshots match the current iOS backend, not field-level merging. No iOS/Tower edits made.

## Tower keys and behavior

- `maintenance`: `enabled,message`; blocking overlay and feature network gates.
- `min_version`: `web,message`; blocking update overlay.
- `latest_version`: `web,message,store_urls.web`; update nudge; web reloads to update.
- `features`: `indoor_maps,traffic_reports,sync,speed_limits,traffic_coloring,transit` actively gate their paths. `voice_guidance=false` cancels browser speech; web has no spoken navigation feature yet. New switches default on when absent or malformed. `feedback,incident_feeds` decode, but corresponding product features are absent, so do not count as implemented controls.
- `announcement`: `enabled,title,body,level,url,starts_at,ends_at`; validated HTTP(S) link and active window, dismissible presentation.
- `platform_overrides.web`: features combine as global AND web (explicit false only); global OR web maintenance, with web message preferred when enabled; live web announcement overrides global, otherwise falls back to global. Other platform overrides ignored.
- Unknown keys ignored; other platforms' version fields ignored. Launch/foreground refresh and cached/default behavior on failures. Config and messages use authenticated headers when signed in. Candidate cancels queued snapshot writes when sign-out, maintenance or sync-off revokes permission; it cannot retract an HTTP request already sent.

## Parity and evidence

| Feature | State | Evidence / remaining gap |
|---|---|---|
| Indoor | Partial | Shared live directory, airport floor picker/browse and published indoor cells work; no full indoor routing/arrival/floor-follow parity; some CDN cells absent. |
| Speed limits | Partial | Shared bounded viewport overlay and route annotations; FL FDOT state-road coverage is not every road or nationwide coverage. No full iOS live driving speed matching/camera alerts. New regions can use same table without a web hardcode. |
| Rural detail / place cards | Partial | PR #28 deployed by CI. Marfa TX, Custer SD, Ely MN compared at zoom 10/13/16 with Google, 18 screenshots; county/service/track styling, land/water/hillshade and thin-data fallbacks. Samples are not a nationwide completeness certification. See RURAL_QA.md. |
| Sign-in | Partial | Google/Apple authorize redirects verified; Apple form_post cancellation returns to app host. Apple chooser restored in candidate. Successful fresh Google and Apple code exchange/session round trips not yet demonstrated. |
| Sync | Partial | Matching snapshot fields; own-row reads and foreign-owner denial verified live. Candidate closes queued-write pause race. Full fresh-Google cross-device write/read not exercised; Home/Work display/edit is included in this candidate. |
| Remote controls | Partial | Core maintenance/minimum/latest/announcements/indoor/report/sync gates tested. Feedback and DOT incident feed product paths absent. |

Production RLS exercised with an existing Apple-backed authenticated session: own snapshot 200/one row; unfiltered snapshots only own row; foreign UUID lookup 200/empty; foreign-owner insert rejected 403/42501 with no row created. Authenticated venues/speeds/config 200. Public venue projection 25 rows and Orlando speed query 500-row cap, valid paths; production Origin/CORS worked. This verifies those paths, not every policy operation. Public-key schema introspection is restricted; source SQL and live projections were compared instead.

## Bugs, limitations and blockers

- PR #29 fixes shipped in 1.0.2: Apple chooser, Speed Trap handling, safe popup text, queued-sync pause and error URL redaction.
- Google fresh-password challenge requires user interaction through secure credential flow. The previous secure request timed out. A 302/account chooser is not a complete Google login test.
- Successful Apple login also needs real account interaction; provider setup and cancellation callback only are proven. Secret rotation belongs to Control (expiry 2027-05-10); web did not access/change it.
- Nationwide indoor/speed datasets and missing CDN cells remain coverage gaps. Feedback and external incident feeds missing; Home/Work editing awaits candidate deployment.
- Lazy Mapbox vendor chunk remains ~1.93 MB raw / 545 kB gzip. CPU-throttled functional smoke passed; physical cheap-laptop GPU/FPS/memory certification is still outstanding. No new DEM source or 3D terrain was added.
- Existing tests: 69 unit checks pass after compatibility changes; build passes; Apple chooser Chrome checks pass. 45 remote-control browser checks pass across Chrome, WebKit, tablet and both phone projects. Local Firefox cannot launch ("Could not find profile folder"), including with a fresh temporary directory; its required Linux CI check remains enabled. Updated full cross-browser CI remains the merge gate.

**Tag verdict: pending candidate CI and deployment.** Verify the new live version/build/commit before tagging `web-v1.0.7`. Full Google/Apple login remains assigned to Daniel and explicitly not a tag blocker. Never move existing release tags.
