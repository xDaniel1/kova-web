import { expect, test } from '@playwright/test'

// Keep the production service worker from bypassing Playwright's network fixtures.
test.use({ serviceWorkers: 'block' })

test.beforeEach(async ({ page }) => {
  await page.route('**/search/searchbox/v1/suggest?**', route => route.fulfill({ json: {
    suggestions: [{ mapbox_id: 'test-place', name: 'Test Coffee', full_address: 'New York', feature_type: 'poi' }],
  } }))
  await page.route('**/search/searchbox/v1/retrieve/test-place?**', route => route.fulfill({ json: {
    features: [{ geometry: { coordinates: [-73.9857, 40.7484] } }],
  } }))
})

test('a suggestion can be activated with keyboard focus', async ({ page }) => {
  await page.goto('/')
  const input = page.getByLabel('Search Kova Maps')
  await input.fill('Test Coffee')
  const suggestion = page.locator('.suggestions button').first()
  await expect(suggestion).toContainText('Test Coffee')
  await suggestion.focus()
  // Moving focus into the list must keep it mounted, including after a pause.
  await expect(suggestion).toBeFocused()
  await suggestion.press('Enter')
  await expect(page).toHaveURL(/place=40.7484/)
})

test('a touch tap activates a suggestion', async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: 'block', hasTouch: true, viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  await page.route('**/search/searchbox/v1/suggest?**', route => route.fulfill({ json: {
    suggestions: [{ mapbox_id: 'test-place', name: 'Test Coffee', feature_type: 'poi' }],
  } }))
  await page.route('**/search/searchbox/v1/retrieve/test-place?**', route => route.fulfill({ json: {
    features: [{ geometry: { coordinates: [-73.9857, 40.7484] } }],
  } }))
  await page.goto('/')
  await page.getByLabel('Search Kova Maps').fill('Test Coffee')
  await page.locator('.suggestions button').first().tap()
  await expect(page).toHaveURL(/place=40.7484/)
  await context.close()
})

test('suggestion errors explain the next action', async ({ page }) => {
  await page.route('**/search/searchbox/v1/suggest?**', route => route.fulfill({ status: 503, body: '{}' }))
  await page.goto('/')
  await page.getByLabel('Search Kova Maps').fill('Coffee')
  await expect(page.getByRole('status')).toContainText('Suggestions unavailable. Press Search')
})


test('the map keeps its viewport height after the deferred stylesheet loads', async ({ page }) => {
  await page.goto('/')
  const map = page.locator('.map.mapboxgl-map')
  await expect(map).toBeVisible()
  await expect(page.locator('link[href*="mapbox"][rel="stylesheet"]')).toHaveCount(1)
  await expect.poll(async () => map.evaluate(el => ({
    height: el.getBoundingClientRect().height / window.innerHeight, position: getComputedStyle(el).position,
  }))).toEqual({ height: 1, position: 'absolute' })
})
