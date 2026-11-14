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
  // GitHub Pages' 404 for an indoor cell with no plan has no CORS header; Safari reports that as an error.
  page.on('pageerror', e => { if (!/kovamaps\.com\/indoor\/.*access control checks/.test(e.message)) errors.push(e.message) })
  await page.route('**/rest/v1/rpc/speed_limits_in_box**', r => { reads++; return r.fulfill({ status: 404, json: { code: 'PGRST205' } }) })
  await page.goto('/?place=28.5383,-81.3792&q=Orlando')
  await expect(page.locator('.map.mapboxgl-map, .map.map-failed')).toBeVisible()
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: /Layers: show/ }).hover()
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


test('airport Browse remains clickable beside the speed control', async ({ page }) => {
  await page.goto('/?place=28.4265,-81.3085&q=MCO')
  await expect(page.locator('.map.mapboxgl-map, .map.map-failed')).toBeVisible()
  if (await page.locator('.map.map-failed').count()) {
    await expect(page.getByLabel('Search Kova Maps')).toBeVisible()
    return
  }
  await expect(page.locator('.indoor-browse')).toContainText('MCO', { timeout: 30000 })
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await page.locator('.indoor-browse').click()
  await expect(page.locator('.indoor-directory')).toBeVisible()
})
