import { expect, test, type Page } from '@playwright/test'

async function mapOrFallback(page: Page) {
  const map = page.locator('.map.mapboxgl-map, .map.map-failed')
  await expect(map).toBeVisible()
  if (await page.locator('.map.map-failed').count()) {
    await expect(page.getByLabel('Search Kova Maps')).toBeVisible()
    return false
  }
  return true
}

test('a new session opens at a national overview', async ({ page }) => {
  await page.goto('/')
  if (!await mapOrFallback(page)) return
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('kova.camera.v1') ?? 'null'))).toMatchObject({ longitude: -110, latitude: 43, zoom: 2 })
})

test('a western map area survives reopening the app', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('kova.camera.v1', JSON.stringify({ longitude: -122.33, latitude: 47.61, zoom: 12, seed: true })))
  await page.goto('/')
  if (!await mapOrFallback(page)) return
  // The seed disappears only when the map emits its actual position after load.
  await expect.poll(() => page.evaluate(() => {
    const c = JSON.parse(localStorage.getItem('kova.camera.v1') ?? '{}')
    return !c.seed && Math.abs(c.longitude + 122.33) < 0.00001 && Math.abs(c.latitude - 47.61) < 0.00001 && c.zoom === 12
  })).toBe(true)
})

test('a shared Hawaii link takes priority over the saved mainland area', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('kova.camera.v1', JSON.stringify({ longitude: -122.33, latitude: 47.61, zoom: 12 })))
  await page.goto('/?place=21.3069,-157.8583&q=Honolulu')
  if (!await mapOrFallback(page)) return
  await expect.poll(() => page.evaluate(() => {
    const c = JSON.parse(localStorage.getItem('kova.camera.v1') ?? '{}')
    return Math.abs(c.latitude - 21.3069) < 0.1 && Math.abs(c.longitude + 157.8583) < 0.1 && c.zoom >= 15
  })).toBe(true)
})
