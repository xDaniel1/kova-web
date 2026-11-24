import { expect, test } from '@playwright/test'

// Cameras and tolls along a drive (iPhone build 77). The data comes from public OpenStreetMap
// servers, so the panel must be honest when they are down and when nothing is mapped.
const route = (status: number, elements: unknown[] = []) => async (r: import('@playwright/test').Route) =>
  status === 200 ? r.fulfill({ json: { elements } }) : r.fulfill({ status, body: 'busy' })

test('a drive says the route could not be checked when the map-data servers are down', async ({ page }) => {
  await page.route('**/api/interpreter', route(504))
  await page.route('**/osm/tools/overpass/api/interpreter', route(504))
  await page.goto('/?from=40.7580,-73.9855&to=40.7484,-73.9857&mode=driving')
  await page.getByText('Details', { exact: true }).first().click()
  const section = page.getByRole('region', { name: 'Cameras and tolls on this route' })
  await expect(section).toContainText('could not be checked right now', { timeout: 30000 })
})

test('a fully checked drive with nothing mapped says so', async ({ page }) => {
  await page.route('**/api/interpreter', route(200))
  await page.route('**/osm/tools/overpass/api/interpreter', route(200))
  await page.goto('/?from=40.7580,-73.9855&to=40.7484,-73.9857&mode=driving')
  await page.getByText('Details', { exact: true }).first().click()
  await expect(page.getByRole('region', { name: 'Cameras and tolls on this route' })).toContainText('none mapped on this route', { timeout: 30000 })
})

test('a mapped speed camera on the drive is listed with its limit', async ({ page }) => {
  // A speed camera right at the start of the drive (no direction tagged, so it covers all round).
  const camera = { type: 'node', id: 4242, lat: 40.758, lon: -73.9855, tags: { highway: 'speed_camera', maxspeed: '25 mph' } }
  await page.route('**/api/interpreter', route(200, [camera]))
  await page.route('**/osm/tools/overpass/api/interpreter', route(200, [camera]))
  await page.goto('/?from=40.7580,-73.9855&to=40.7484,-73.9857&mode=driving')
  await page.getByText('Details', { exact: true }).first().click()
  const section = page.getByRole('region', { name: 'Cameras and tolls on this route' })
  await expect(section).toContainText('Fixed Radar ahead', { timeout: 30000 })
  await expect(section).toContainText('25 mph')
  await expect(section).not.toContainText('none mapped')
})
