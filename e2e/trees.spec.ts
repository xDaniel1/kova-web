import { expect, test } from '@playwright/test'

// iPhone builds 19-20 parity: Kova's own 3D trees from tree_cover_tiles, from zoom 15.
test('Central Park plants Kova trees from our tree tiles', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('kova.camera.v1', JSON.stringify({ longitude: -73.9665, latitude: 40.7812, zoom: 16 })))
  await page.goto('/')
  const map = page.locator('.map.mapboxgl-map, .map.map-failed')
  await expect(map).toBeVisible()
  test.skip(await page.locator('.map.map-failed').count() > 0, 'No WebGL in this browser')
  await expect.poll(async () => Number(await page.locator('.mapboxgl-map').getAttribute('data-trees') ?? 0), { timeout: 30_000 }).toBeGreaterThan(500)
})
