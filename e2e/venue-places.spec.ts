import { expect, test } from '@playwright/test'

// Venues with no floor plan list and name their places from the map tiles (iOS build 8 parity).
test('a theme park with no floor plan gets a Browse list with rides and food', async ({ page, isMobile }) => {
  await page.goto('/?place=28.4188,-81.5812&q=Magic%20Kingdom')
  // The places come from rendered map tiles; a browser without WebGL has no map to read.
  const webgl = await page.evaluate(() => !!document.createElement('canvas').getContext('webgl'))
  test.skip(!webgl, 'No WebGL in this browser, so the map (and its places) cannot render')
  // On phones the place sheet covers the map and hides Browse, as at airports: close it first.
  if (isMobile) {
    await page.getByRole('search').getByRole('button', { name: 'Close' }).click()
    await expect(page.getByRole('complementary', { name: 'Details' })).toHaveCount(0)
  }
  const browse = page.getByRole('button', { name: 'Browse Magic Kingdom' })
  await expect(browse).toBeVisible({ timeout: 30000 })
  await browse.click()
  const directory = page.getByRole('region', { name: 'Magic Kingdom directory' })
  await expect(directory.getByRole('heading', { name: 'Rides & Attractions' })).toBeVisible()
  await expect(directory.getByRole('heading', { name: 'Food & Drink' })).toBeVisible()
})
