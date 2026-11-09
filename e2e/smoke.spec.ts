import { expect, test } from '@playwright/test'

// These hit the real tile, geocoder and routing services on purpose: a broken style URL or a
// changed API shape should fail the deploy, not surprise a user.

test('search a place and open its card', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Search places').fill('Empire State Building')
  const first = page.locator('.list li button').first()
  await expect(first).toContainText('Empire State Building', { timeout: 20_000 })
  await first.click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Empire State Building')
  await expect(page).toHaveURL(/place=40\.74/)
})

test('a shared directions link routes through every stop', async ({ page }) => {
  await page.goto('/?from=40.750504,-73.993439&to=40.748441,-73.985664&via=40.758896,-73.985130&q=Madison%20Square%20Garden|Times%20Square|Empire%20State%20Building')
  await expect(page.getByText(/arrive \d/)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('Madison Square Garden → Times Square')).toBeVisible()
  await expect(page.getByText('Times Square → Empire State Building')).toBeVisible()
})

test('map tiles load without console errors', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.goto('/')
  await page.waitForResponse((r) => r.url().includes('openfreemap.org') && r.url().endsWith('.pbf') && r.ok(), { timeout: 20_000 })
  expect(errors).toEqual([])
})
