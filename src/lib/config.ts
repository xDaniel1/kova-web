// Public configuration only. The anon key is safe to ship: every table is behind
// row-level security (see supabase/schema.sql in the iOS repo). Never put a
// service-role key here.
export const config = {
  supabase: {
    url: 'https://fbumdslhguoytlhlrkyr.supabase.co',
    anonKey: 'sb_publishable_IP2ARQYuyoVKp5yaJg7SCw_K567lTdZ',
  },
  // Keyless OpenStreetMap-based services. Fine for development and light use;
  // swap for a paid or self-hosted endpoint before real traffic (see ROADMAP.md).
  tiles: { styleURL: 'https://tiles.openfreemap.org/styles/liberty' },
  geocoder: { baseURL: 'https://photon.komoot.io' },
  router: { baseURL: 'https://router.project-osrm.org' },
  // Where the iPhone app lives.
  appStoreURL: 'https://apps.apple.com/app/id6827830148',
  // Public TestFlight link; works once Apple's Beta App Review has approved the current build.
  testFlightURL: 'https://testflight.apple.com/join/cWQN9SQm',
  siteURL: 'https://kovamaps.com',
}
