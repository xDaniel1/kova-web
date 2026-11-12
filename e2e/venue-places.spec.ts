import { expect, test } from '@playwright/test'

// Venues with no floor plan list and name their places from the map tiles (iOS build 8 parity).
test('a theme park with no floor plan gets a Browse list with rides and food', async ({ page }) => {
  await page.goto('/?place=28.4188,-81.5812&q=Magic%20Kingdom')
  const browse = page.getByRole('button', { name: 'Browse Magic Kingdom' })
  await expect(browse).toBeVisible({ timeout: 30000 })
  await browse.click()
  const directory = page.getByRole('region', { name: 'Magic Kingdom directory' })
  await expect(directory.getByRole('heading', { name: 'Rides & Attractions' })).toBeVisible()
  await expect(directory.getByRole('heading', { name: 'Food & Drink' })).toBeVisible()
})
