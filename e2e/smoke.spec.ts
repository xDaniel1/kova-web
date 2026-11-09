import { expect, test, type Page } from '@playwright/test'

// These hit the real Mapbox, Google (via the Edge Function) and Supabase services on purpose:
// a broken token, style or API shape should fail the deploy, not surprise a user.

test('search suggests places and opens the place panel', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Search Kova Maps').fill('Empire State Building')
  const first = page.locator('.suggestions button').first()
  await expect(first).toContainText('Empire State Building', { timeout: 20_000 })
  await first.click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Empire State Building', { timeout: 20_000 })
  await expect(page.getByRole('button', { name: 'Directions' }).first()).toBeVisible()
  await expect(page).toHaveURL(/place=40\.74/)
})

test('a category chip lists rated places', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Coffee' }).click()
  await expect(page.locator('.results li').first()).toBeVisible({ timeout: 30_000 })
  await expect(page).toHaveURL(/search=coffee/)
})

test('a shared directions link shows routes and mode times', async ({ page }) => {
  await page.goto('/?from=40.750504,-73.993439&to=40.748441,-73.985664&q=Madison%20Square%20Garden|Empire%20State%20Building')
  await expect(page.locator('.route-option').first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('tab', { name: 'Driving' })).toContainText(/min/)
})

/** Headless Firefox on CI has no WebGL; the map tests only make sense where a map can start. */
const hasWebGL = (page: Page) => page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'))

test('without WebGL the app still works and explains the missing map', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      return /webgl/.test(type) ? null : (original as (...a: unknown[]) => unknown).call(this, type, ...rest)
    } as typeof original
  })
  await page.goto('/')
  await expect(page.getByText('The map can’t be shown')).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: 'Coffee' }).click()
  await expect(page.locator('.results li').first()).toBeVisible({ timeout: 30_000 })
})

test('the map loads without console errors', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && !/404/.test(m.text()) && errors.push(m.text()))
  const tiles = page.waitForResponse((r) => r.url().includes('api.mapbox.com/v4/') && r.ok(), { timeout: 30_000 }).catch(() => null)
  await page.goto('/')
  test.skip(!(await hasWebGL(page)), 'no WebGL in this browser')
  expect(await tiles).not.toBeNull()
  expect(errors).toEqual([])
})

test('dark mode renders the map without errors', async ({ browser }) => {
  const context = await browser.newContext({ colorScheme: 'dark' })
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const style = page.waitForResponse((r) => r.url().includes('dark-v11') && r.ok(), { timeout: 30_000 }).catch(() => null)
  await page.goto('/')
  test.skip(!(await hasWebGL(page)), 'no WebGL in this browser')
  expect(await style).not.toBeNull()
  await page.waitForTimeout(2500)
  expect(errors).toEqual([])
  await context.close()
})
