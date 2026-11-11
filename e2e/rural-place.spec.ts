import { expect, test } from '@playwright/test'

test('thin rural details keep useful actions without invented ratings', async ({ page }) => {
  await page.route('**/functions/v1/google/places/search', r => r.fulfill({ json: { places: [] } }))
  await page.goto('/?place=30.3106,-104.0206&q=Rural%20trailhead')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Rural trailhead')
  await expect(page.getByText('Limited place details here.', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Directions', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible()
  await expect(page.getByText('30.31060, -104.02060', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open this location in Google Maps' })).toHaveAttribute('href', /query=30.3106%2C-104.0206/)
  await expect(page.locator('.rating-line')).toHaveCount(0)
})

test('unknown opening status is not closed and broken photos have a fallback', async ({ page }) => {
  await page.route('**/functions/v1/google/places/search', r => r.fulfill({ json: { places: [{ id: 'rural', displayName: { text: 'Rural store' }, location: { latitude: 30.3106, longitude: -104.0206 }, currentOpeningHours: { weekdayDescriptions: ['Monday: 9 AM – 5 PM'] }, photos: [{ name: 'broken-photo', widthPx: 600, heightPx: 400 }] }] } }))
  await page.route('**/functions/v1/google/places/photo?**', r => r.fulfill({ status: 404, body: '' }))
  await page.goto('/?place=30.3106,-104.0206&q=Rural%20store')
  await expect(page.getByText('Hours available; current status unknown')).toBeVisible()
  await expect(page.locator('.photo-unavailable')).toBeVisible()
  await expect(page.getByText('Closed', { exact: true })).toHaveCount(0)
})
