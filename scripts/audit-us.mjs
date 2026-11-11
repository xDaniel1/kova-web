// Live, opt-in provider audit. One representative city per state is a baseline,
// not proof of rural, transit, address or indoor coverage. Never run on every PR.
import { readFile, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
const fixtures = JSON.parse(await readFile(new URL('../coverage/us-states.json', import.meta.url), 'utf8'))
let token = process.env.VITE_MAPBOX_TOKEN
if (!token) {
  const env = await readFile(new URL('../.env.local', import.meta.url), 'utf8').catch(() => '')
  token = env.match(/^VITE_MAPBOX_TOKEN\s*=\s*["']?([^\s"']+)/m)?.[1]
}
if (!token) throw new Error('Set VITE_MAPBOX_TOKEN or provide .env.local')
const statesArg = process.argv.find(x => x.startsWith('--states='))?.slice(9).split(',')
const smallTowns = process.argv.includes('--small-towns')
const selected = statesArg ? fixtures.filter(x => statesArg.includes(x.code)) : fixtures
const states = smallTowns ? selected.filter(x => x.smallTown).map(x => ({ ...x, city: x.smallTown })) : selected
if (!states.length || statesArg?.some(code => !fixtures.some(x => x.code === code))) throw new Error('Unknown state code')
const output = process.argv.find(x => x.startsWith('--output='))?.slice(9) ?? (smallTowns ? 'coverage/us-small-towns-latest.json' : 'coverage/us-latest.json')
const configText = await readFile(new URL('../src/lib/config.ts', import.meta.url), 'utf8')
const supabase = configText.match(/url: '(https:\/\/[^']+)'/)?.[1]
const key = configText.match(/anonKey: '([^']+)'/)?.[1]
const checks = async (fn) => {
  const start = performance.now()
  try { return { status: 'pass', ...await fn(), elapsedMs: Math.round(performance.now() - start) } }
  catch (e) { return { status: 'fail', error: e.message, elapsedMs: Math.round(performance.now() - start) } }
}
async function json(url, init) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}
function mb(path, params = {}) {
  const url = new URL(path, 'https://api.mapbox.com')
  for (const [k, v] of Object.entries({ ...params, access_token: token })) url.searchParams.set(k, v)
  return url
}
const results = []
for (const state of states) {
  let point
  const search = await checks(async () => {
    const session = randomUUID()
    const s = await json(mb('/search/searchbox/v1/suggest', { q: `${state.city}, ${state.state}`, country: 'US', types: 'place,locality', session_token: session, limit: '5' }))
    const candidate = s.suggestions?.find(x => x.name.toLowerCase() === state.city.toLowerCase())
    if (!candidate) throw new Error('No matching city suggestion')
    const r = await json(mb(`/search/searchbox/v1/retrieve/${encodeURIComponent(candidate.mapbox_id)}`, { session_token: session }))
    const f = r.features?.[0]
    const region = f?.properties?.context?.region
    if (![state.code, `US-${state.code}`].includes(region?.region_code ?? region?.region_code_full)) throw new Error('City resolved outside expected state')
    point = f.geometry?.coordinates
    if (!Array.isArray(point) || !point.every(Number.isFinite)) throw new Error('Missing coordinates')
    return {}
  })
  const route = async profile => checks(async () => {
    if (!point) throw new Error('Blocked by search failure')
    const [lon, lat] = point
    const r = await json(mb(`/directions/v5/mapbox/${profile}/${lon},${lat};${lon + 0.01},${lat + 0.01}`, { overview: 'false', steps: 'true' }))
    if (r.code !== 'Ok' || !(r.routes?.[0]?.distance > 0) || !(r.routes?.[0]?.duration > 0)) throw new Error(r.code ?? 'No usable route')
    if (r.waypoints?.some(w => w.distance > 2000)) throw new Error('Route snapped over 2 km from fixture')
    return { distanceMeters: Math.round(r.routes[0].distance), durationSeconds: Math.round(r.routes[0].duration) }
  })
  const driving = await route('driving-traffic')
  const walking = await route('walking')
  const places = await checks(async () => {
    if (!point) throw new Error('Blocked by search failure')
    const data = await json(`${supabase}/functions/v1/google/places/search`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: key },
      body: JSON.stringify({ query: `restaurants in ${state.city}, ${state.state}`, near: { longitude: point[0], latitude: point[1] }, radius: 10000 }),
    })
    if (!data.places?.length) throw new Error('No nearby places')
    return { count: data.places.length }
  })
  const row = { ...state, search, driving, walking, places, rural: smallTowns ? 'single-town-sample' : 'not-tested', transit: 'not-tested', indoor: 'not-tested' }
  results.push(row)
  console.log(`${state.code} ${state.city}: ${['search', 'driving', 'walking', 'places'].map(k => `${k}=${row[k].status}`).join(' ')}`)
}
const failed = results.filter(row => ['search', 'driving', 'walking', 'places'].some(k => row[k].status !== 'pass'))
await writeFile(output, JSON.stringify({ checkedAt: new Date().toISOString(), scope: smallTowns ? 'One small-town provider sample per state. No claim of comprehensive rural, transit or indoor coverage.' : 'Representative capital-city provider checks only. No claim of statewide, rural, transit or indoor coverage.', statesChecked: results.length, statesWithGaps: failed.length, results }, null, 2) + '\n')
console.log(`Wrote ${output}: ${results.length} jurisdictions checked; ${failed.length} with gaps`)
if (failed.length) process.exitCode = 1
