// Public configuration only. The anon key is safe to ship: every table is behind
// row-level security (see supabase/schema.sql in the iOS repo). Never put a
// service-role key here.
export const config = {
  supabase: {
    url: 'https://fbumdslhguoytlhlrkyr.supabase.co',
    anonKey: 'sb_publishable_IP2ARQYuyoVKp5yaJg7SCw_K567lTdZ',
  },
  // Mapbox public (pk.) token, the same account as the iPhone Mapbox edition. Public tokens are
  // meant to ship to clients; restrict it to https://app.kovamaps.com in the Mapbox account.
  mapbox: {
    // Injected at build time from the VITE_MAPBOX_TOKEN secret (GitHub Actions) or .env.local.
    token: import.meta.env.VITE_MAPBOX_TOKEN ?? '',
    // Mapbox Standard, as on iPhone. Day and night are one style with a light preset (mapStyle.ts).
    styles: {
      light: 'mapbox://styles/mapbox/standard',
      dark: 'mapbox://styles/mapbox/standard',
      satellite: 'mapbox://styles/mapbox/standard-satellite',
    },
  },
  // Where the iPhone app lives.
  appStoreURL: 'https://apps.apple.com/app/id6827830148',
  // Public TestFlight link; works once Apple's Beta App Review has approved the current build.
  testFlightURL: 'https://testflight.apple.com/join/cWQN9SQm',
  siteURL: 'https://kovamaps.com',
}
