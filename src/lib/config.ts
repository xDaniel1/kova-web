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
    styles: {
      light: 'mapbox://styles/mapbox/streets-v12',
      dark: 'mapbox://styles/mapbox/dark-v11',
      satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
    },
  },
  // Where the iPhone app lives.
  appStoreURL: 'https://apps.apple.com/app/id6827830148',
  // Public TestFlight link; works once Apple's Beta App Review has approved the current build.
  testFlightURL: 'https://testflight.apple.com/join/cWQN9SQm',
  siteURL: 'https://kovamaps.com',
}
