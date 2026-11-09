// Google proxy for the web app. Holds the Google API key so it never ships to a browser.
//
//   POST /google/places/search   { query, near?: {latitude, longitude} }        → one place with full details
//   GET  /google/places/photo?name=places/…/photos/…&maxWidth=800               → 302 to the image
//   POST /google/places/list     { query, center, radius }                      → up to 20 places, Google-ranked
//   POST /google/places/nearby   { latitude, longitude, radius, types: [...] }  → places for the guides shelves
//   POST /google/transit         { origin, destination, departureTime?, arrivalTime? } → Routes API transit routes
//
// Callers must send the project's publishable key in `apikey` (the same thing the Supabase client
// sends), and browsers must come from an allowed origin. Deployed with --no-verify-jwt because the
// publishable key is not a JWT; the apikey check is what keeps random callers out.

const GOOGLE_KEY = Deno.env.get('GOOGLE_API_KEY') ?? ''
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const BUNDLE_ID = Deno.env.get('IOS_BUNDLE_ID') ?? 'com.danielguzman.waypoint'
const ALLOWED_ORIGINS = ['https://app.kovamaps.com', 'http://localhost:5173', 'http://localhost:4173']

const DETAIL_FIELDS = [
  'id', 'displayName', 'primaryTypeDisplayName', 'formattedAddress', 'location',
  'internationalPhoneNumber', 'websiteUri', 'rating', 'userRatingCount', 'priceLevel',
  'businessStatus', 'currentOpeningHours', 'photos', 'reviews', 'editorialSummary', 'googleMapsUri',
].map((f) => `places.${f}`).join(',')

const NEARBY_FIELDS = ['id', 'displayName', 'formattedAddress', 'shortFormattedAddress', 'location', 'rating', 'userRatingCount', 'photos', 'primaryTypeDisplayName', 'priceLevel', 'currentOpeningHours.openNow', 'currentOpeningHours.weekdayDescriptions']
  .map((f) => `places.${f}`).join(',')

const TRANSIT_FIELDS = [
  'routes.duration', 'routes.distanceMeters', 'routes.polyline.encodedPolyline', 'routes.description',
  'routes.legs.steps.transitDetails', 'routes.legs.steps.travelMode', 'routes.legs.steps.staticDuration',
  'routes.legs.steps.polyline.encodedPolyline', 'routes.legs.steps.navigationInstruction',
  'routes.legs.steps.distanceMeters', 'routes.travelAdvisory.transitFare',
].join(',')

function cors(origin: string | null): HeadersInit {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'apikey, authorization, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin',
  }
}

function json(body: unknown, status: number, headers: HeadersInit, cacheSeconds = 0): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json', ...(cacheSeconds ? { 'Cache-Control': `public, max-age=${cacheSeconds}` } : {}) },
  })
}

async function google(url: string, init: RequestInit & { fieldMask?: string }): Promise<Response> {
  const headers: Record<string, string> = {
    'X-Goog-Api-Key': GOOGLE_KEY,
    'X-Ios-Bundle-Identifier': BUNDLE_ID,
    'Content-Type': 'application/json',
  }
  if (init.fieldMask) headers['X-Goog-FieldMask'] = init.fieldMask
  return fetch(url, { ...init, headers })
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  const h = cors(origin)
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h })

  const url = new URL(req.url)
  const apikey = req.headers.get('apikey') ?? url.searchParams.get('apikey')
  if (!ANON_KEY || apikey !== ANON_KEY) return json({ error: 'unauthorized' }, 401, h)
  if (origin && !ALLOWED_ORIGINS.includes(origin)) return json({ error: 'origin not allowed' }, 403, h)
  if (!GOOGLE_KEY) return json({ error: 'GOOGLE_API_KEY not configured' }, 500, h)

  // Path after the function name, e.g. /google/places/search → /places/search
  const path = url.pathname.replace(/^\/google/, '')

  try {
    if (req.method === 'POST' && path === '/places/search') {
      const { query, near } = await req.json()
      if (typeof query !== 'string' || !query.trim()) return json({ error: 'query required' }, 400, h)
      const body: Record<string, unknown> = { textQuery: query, maxResultCount: 1, languageCode: 'en' }
      if (near && Number.isFinite(near.latitude) && Number.isFinite(near.longitude)) {
        body.locationBias = { circle: { center: { latitude: near.latitude, longitude: near.longitude }, radius: 500 } }
      }
      const r = await google('https://places.googleapis.com/v1/places:searchText', { method: 'POST', body: JSON.stringify(body), fieldMask: DETAIL_FIELDS })
      return json(await r.json(), r.status, h, r.ok ? 3600 : 0)
    }

    if (req.method === 'GET' && path === '/places/photo') {
      const name = url.searchParams.get('name') ?? ''
      const maxWidth = Math.min(1600, Math.max(100, Number(url.searchParams.get('maxWidth') ?? 800)))
      if (!/^places\/[^/]+\/photos\/[^/]+$/.test(name)) return json({ error: 'bad photo name' }, 400, h)
      const r = await google(`https://places.googleapis.com/v1/${name}/media?maxWidthPx=${maxWidth}&skipHttpRedirect=true`, { method: 'GET' })
      const data = await r.json()
      if (!r.ok || !data.photoUri) return json(data, r.status === 200 ? 502 : r.status, h)
      return new Response(null, { status: 302, headers: { ...h, Location: data.photoUri, 'Cache-Control': 'public, max-age=86400' } })
    }

    if (req.method === 'POST' && path === '/places/list') {
      const { query, center, radius } = await req.json()
      if (typeof query !== 'string' || !query.trim()) return json({ error: 'query required' }, 400, h)
      const body: Record<string, unknown> = { textQuery: query, pageSize: 20, languageCode: 'en' }
      if (center && Number.isFinite(center.latitude) && Number.isFinite(center.longitude)) {
        body.locationBias = { circle: { center: { latitude: center.latitude, longitude: center.longitude }, radius: Math.min(50000, Math.max(200, Number(radius) || 3000)) } }
      }
      const r = await google('https://places.googleapis.com/v1/places:searchText', { method: 'POST', body: JSON.stringify(body), fieldMask: NEARBY_FIELDS })
      return json(await r.json(), r.status, h, r.ok ? 900 : 0)
    }

    if (req.method === 'POST' && path === '/places/nearby') {
      const { latitude, longitude, radius, types } = await req.json()
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Array.isArray(types)) return json({ error: 'latitude, longitude, types required' }, 400, h)
      const body = {
        includedPrimaryTypes: types.slice(0, 10),
        maxResultCount: 12,
        rankPreference: 'POPULARITY',
        languageCode: 'en',
        locationRestriction: { circle: { center: { latitude, longitude }, radius: Math.min(50000, Math.max(100, Number(radius) || 3000)) } },
      }
      const r = await google('https://places.googleapis.com/v1/places:searchNearby', { method: 'POST', body: JSON.stringify(body), fieldMask: NEARBY_FIELDS })
      return json(await r.json(), r.status, h, r.ok ? 1800 : 0)
    }

    if (req.method === 'POST' && path === '/transit') {
      const { origin: o, destination: d, departureTime, arrivalTime } = await req.json()
      for (const p of [o, d]) if (!p || !Number.isFinite(p.latitude) || !Number.isFinite(p.longitude)) return json({ error: 'origin and destination required' }, 400, h)
      const body: Record<string, unknown> = {
        origin: { location: { latLng: { latitude: o.latitude, longitude: o.longitude } } },
        destination: { location: { latLng: { latitude: d.latitude, longitude: d.longitude } } },
        travelMode: 'TRANSIT',
        computeAlternativeRoutes: true,
        languageCode: 'en-US',
      }
      if (arrivalTime) body.arrivalTime = arrivalTime
      else if (departureTime) body.departureTime = departureTime
      const r = await google('https://routes.googleapis.com/directions/v2:computeRoutes', { method: 'POST', body: JSON.stringify(body), fieldMask: TRANSIT_FIELDS })
      return json(await r.json(), r.status, h)
    }

    return json({ error: 'not found' }, 404, h)
  } catch (e) {
    return json({ error: (e as Error).message }, 500, h)
  }
})
