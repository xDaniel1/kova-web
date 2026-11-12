import { expect, test } from '@playwright/test'

test('iOS favorite roles can move and clear without losing customizations', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('kova.snapshot.v1', JSON.stringify({ updatedAt: new Date().toISOString(), recents: [], favorites: [
      { id: 'A', title: 'Old home', subtitle: 'New York', latitude: 40.75, longitude: -73.99, role: 'home', futureField: 'keep' },
      { id: 'B', title: 'Office', subtitle: 'New York', latitude: 40.76, longitude: -73.98, role: 'work' },
    ] }))
  })
  await page.goto('/?place=40.76,-73.98&q=Office')
  await page.getByRole('button', { name: 'Edit saved place' }).click()
  await expect(page.getByRole('radio', { name: 'Work', exact: true })).toBeChecked()
  await page.getByRole('radio', { name: 'Home', exact: true }).check()
  await expect(page.getByRole('radio', { name: 'Home', exact: true })).toBeChecked()
  let favorites = await page.evaluate(() => JSON.parse(localStorage.getItem('kova.snapshot.v1')!).favorites)
  expect(favorites[0]).toMatchObject({ role: null, futureField: 'keep' })
  expect(favorites[1].role).toBe('home')
  await page.getByRole('radio', { name: 'Other', exact: true }).check()
  favorites = await page.evaluate(() => JSON.parse(localStorage.getItem('kova.snapshot.v1')!).favorites)
  expect(favorites[1].role).toBeNull()
})
