import { expect, test } from '@playwright/test'

test('Tower disabling indoor maps prevents venue and cell requests', async ({ page }) => {
  let requests = 0
  await page.route('**/rest/v1/app_config*', r => r.fulfill({ json: [{ key: 'features', value: { indoor_maps: false } }] }))
  await page.route('**/rest/v1/venues?**', r => { requests++; return r.fulfill({ json: [] }) })
  await page.route('**/indoor/indoor_*.json', r => { requests++; return r.fulfill({ status: 404, body: '' }) })
  // Apply the cached switch before the map mounts, as on a return visit.
  await page.addInitScript(() => localStorage.setItem('kova.remoteConfig.v1', JSON.stringify({ features: { indoorMaps: false, trafficReports: true, feedback: true, incidentFeeds: true, sync: true } })))
  await page.goto('/?place=28.4265,-81.3085&q=MCO')
  await expect(page.getByLabel('Search Kova Maps')).toBeVisible()
  await expect(page.locator('.map.mapboxgl-map, .map.map-failed')).toBeVisible()
  await expect.poll(() => page.locator('.indoor-browse').count()).toBe(0)
  expect(requests).toBe(0)
})

test('posted speed data is opt-in and missing data leaves the map usable', async ({ page }) => {
  let reads = 0
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.route('**/rest/v1/speed_limit_segments?**', r => { reads++; return r.fulfill({ status: 404, json: { code: 'PGRST205' } }) })
  await page.goto('/?place=28.5383,-81.3792&q=Orlando')
  await expect(page.locator('.map.mapboxgl-map, .map.map-failed')).toBeVisible()
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  const toggle = page.getByRole('button', { name: 'Posted limits' })
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  expect(reads).toBe(0)
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  if (!await page.locator('.map.map-failed').count()) await expect.poll(() => reads).toBeGreaterThan(0)
  await toggle.click()
  await expect(page.getByLabel('Search Kova Maps')).toBeVisible()
  expect(errors).toEqual([])
})
