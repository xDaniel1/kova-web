# Web release manifest — November 11, 2026

Status: **candidate, not ready for a new tag**. This snapshot precedes the updated PR #29 CI/deploy. It must be updated after that merge; it is not a claim that candidate code is live.

## Source and deployment

- Main HEAD: `52252869f7e97d2b9ceaad0542ffe9c45e97dd82` (PR #28 rural detail / thin place cards).
- Main deployment workflow: [43093783520](https://github.com/xDaniel1/kova-web/actions/runs/43093783520), success, build 36. Build configuration embeds package version `1.0.1`, build and commit. This identifies the successfully deployed artifact; the exact served footer has not been re-read after this deployment.
- Production: https://app.kovamaps.com/.
- Open PR: [#29](https://github.com/xDaniel1/kova-web/pull/29). Original head `210f9473fe196cdb71363945c53860d43b83beff` passed build and cross-browser checks; deploy is correctly skipped on PRs. Updated candidate includes main, Apple UI, Speed Trap compatibility, safe report popup DOM and pending-sync revocation. Updated-head CI is required.
- Existing `web-v1.0.1` points to `49c5ee744664a3020ffe47ff3dbac04d2d940cc0`. Do not move it. A new coordinated semantic version is needed before another release tag.

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

Snapshot JSON: favorites use `id,title,subtitle,latitude,longitude,customTitle?,emoji?,colorHex?`; recents use `id,title,subtitle,latitude,longitude,date`. iOS additionally supports optional favorite `role` (home/work). Web lacks that UI/type; unchanged records retain extra JSON fields, but role editing/parity is incomplete. Last-writer-wins snapshots match the current iOS backend, not field-level merging. No iOS/Tower edits made.

## Tower keys and behavior

- `maintenance`: `enabled,message`; blocking overlay and feature network gates.
- `min_version`: `web,message`; blocking update overlay.
- `latest_version`: `web,message,store_urls.web`; update nudge; web reloads to update.
- `features`: `indoor_maps,traffic_reports,sync` actively gate their paths. `feedback,incident_feeds` decode, but corresponding product features are absent, so do not count as implemented controls.
- `announcement`: `enabled,title,body,level,url,starts_at,ends_at`; validated HTTP(S) link and active window, dismissible presentation.
- Unknown keys ignored; other platforms' version fields ignored. Launch/foreground refresh and cached/default behavior on failures. Config and messages use authenticated headers when signed in. Candidate cancels queued snapshot writes when sign-out, maintenance or sync-off revokes permission; it cannot retract an HTTP request already sent.

## Parity and evidence

| Feature | State | Evidence / remaining gap |
|---|---|---|
| Indoor | Partial | Shared live directory, airport floor picker/browse and published indoor cells work; no full indoor routing/arrival/floor-follow parity; some CDN cells absent. |
| Speed limits | Partial | Shared bounded viewport overlay and route annotations; FL FDOT state-road coverage is not every road or nationwide coverage. No full iOS live driving speed matching/camera alerts. New regions can use same table without a web hardcode. |
| Rural detail / place cards | Partial | PR #28 deployed by CI. Marfa TX, Custer SD, Ely MN compared at zoom 10/13/16 with Google, 18 screenshots; county/service/track styling, land/water/hillshade and thin-data fallbacks. Samples are not a nationwide completeness certification. See RURAL_QA.md. |
| Sign-in | Partial | Google/Apple authorize redirects verified; Apple form_post cancellation returns to app host. Apple chooser restored in candidate. Successful fresh Google and Apple code exchange/session round trips not yet demonstrated. |
| Sync | Partial | Matching snapshot fields; own-row reads and foreign-owner denial verified live. Candidate closes queued-write pause race. Full fresh-Google cross-device write/read not exercised; home/work role UI absent. |
| Remote controls | Partial | Core maintenance/minimum/latest/announcements/indoor/report/sync gates tested. Feedback and DOT incident feed product paths absent. |

Production RLS exercised with an existing Apple-backed authenticated session: own snapshot 200/one row; unfiltered snapshots only own row; foreign UUID lookup 200/empty; foreign-owner insert rejected 403/42501 with no row created. Authenticated venues/speeds/config 200. Public venue projection 25 rows and Orlando speed query 500-row cap, valid paths; production Origin/CORS worked. This verifies those paths, not every policy operation. Public-key schema introspection is restricted; source SQL and live projections were compared instead.

## Bugs, limitations and blockers

- Candidate fixes not live until updated PR #29 passes and merges: Apple chooser, Speed Trap handling, safe popup text, queued-sync pause and error URL redaction.
- Google fresh-password challenge requires user interaction through secure credential flow. The previous secure request timed out. A 302/account chooser is not a complete Google login test.
- Successful Apple login also needs real account interaction; provider setup and cancellation callback only are proven. Secret rotation belongs to Control (expiry 2027-05-10); web did not access/change it.
- Nationwide indoor/speed datasets and missing CDN cells remain coverage gaps. Feedback and external incident feeds missing; favorite home/work editing incomplete.
- Lazy Mapbox vendor chunk remains ~1.93 MB raw / 545 kB gzip. CPU-throttled functional smoke passed; physical cheap-laptop GPU/FPS/memory certification is still outstanding. No new DEM source or 3D terrain was added.
- Existing tests: 63 unit checks pass after compatibility changes; build passes; Apple chooser Chrome checks pass. Updated full cross-browser CI remains the merge gate.

**Tag verdict: no.** Require updated-head CI, merge/deployment and served-version confirmation, full Google round trip, and Control's shared-version decision. Do not re-tag the existing `web-v1.0.1`.
