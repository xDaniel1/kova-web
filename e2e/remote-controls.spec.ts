import { expect, test, type Page } from '@playwright/test'

// Kova Tower controls, per kova-admin docs/app-controls-contract.md. The real endpoints are
// mocked so each control can be exercised without touching production config.

async function mockTower(page: Page, rows: unknown[] | 'fail', messages: unknown[] = []) {
  await page.route('**/rest/v1/app_config*', (r) => (rows === 'fail' ? r.fulfill({ status: 500, body: 'boom' }) : r.fulfill({ json: rows })))
  await page.route('**/rest/v1/app_messages*', (r) => r.fulfill({ json: messages }))
  await page.route('**/rest/v1/rpc/report_client', (r) => r.fulfill({ status: 204, body: '' }))
  await page.route('**/rest/v1/app_message_reads', (r) => r.fulfill({ status: 201, body: '' }))
}

test('config failure leaves the app working normally', async ({ page }) => {
  await mockTower(page, 'fail')
  await page.goto('/')
  await expect(page.getByLabel('Search Kova Maps')).toBeVisible()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
})

test('maintenance mode shows the screen and Try again refetches', async ({ page }) => {
  let calls = 0
  await page.route('**/rest/v1/app_config*', (r) => {
    calls++
    return r.fulfill({ json: [{ key: 'maintenance', value: { enabled: calls < 3, message: 'Upgrading servers' } }] })
  })
  await page.route('**/rest/v1/app_messages*', (r) => r.fulfill({ json: [] }))
  await page.route('**/rest/v1/rpc/report_client', (r) => r.fulfill({ status: 204, body: '' }))
  await page.goto('/')
  await expect(page.getByRole('alertdialog')).toContainText('Upgrading servers')
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('alertdialog')).toHaveCount(0, { timeout: 10_000 })
})

test('a minimum version above ours requires an update and beats maintenance', async ({ page }) => {
  await mockTower(page, [
    { key: 'maintenance', value: { enabled: true, message: 'm' } },
    { key: 'min_version', value: { web: '99.0', message: 'Please reload to update' } },
  ])
  await page.goto('/')
  await expect(page.getByRole('alertdialog')).toContainText('Update required')
  await expect(page.getByRole('alertdialog')).toContainText('Please reload to update')
})

test('an unparseable minimum never blocks', async ({ page }) => {
  await mockTower(page, [{ key: 'min_version', value: { web: 'two', message: 'x' } }])
  await page.goto('/')
  await expect(page.getByLabel('Search Kova Maps')).toBeVisible()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
})

test('announcement banner shows, links safely and dismisses', async ({ page }) => {
  await mockTower(page, [{ key: 'announcement', value: { enabled: true, title: 'Heads up', body: 'New transit data', level: 'warning', url: 'https://kovamaps.com', starts_at: null, ends_at: null } }])
  await page.goto('/')
  const banner = page.locator('.announce.warning')
  await expect(banner).toContainText('Heads up')
  await expect(banner.getByRole('link', { name: 'Learn more' })).toHaveAttribute('href', 'https://kovamaps.com/')
  await banner.getByRole('button', { name: 'Dismiss announcement' }).click()
  await expect(banner).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.announce.warning')).toHaveCount(0)
})

test('update nudge appears when a newer web version is released', async ({ page }) => {
  await mockTower(page, [{ key: 'latest_version', value: { web: '9.9.9', message: 'Faster search' } }])
  await page.goto('/')
  await expect(page.locator('.nudge')).toContainText('Faster search')
})

test('messages show one at a time and are remembered once read', async ({ page }) => {
  await mockTower(page, [], [
    { id: '00000000-0000-0000-0000-000000000002', title: 'Second', body: 'b', level: 'info', url: null, created_at: '2026-11-09T02:00:00Z' },
    { id: '00000000-0000-0000-0000-000000000001', title: 'First', body: 'a', level: 'critical', url: null, created_at: '2026-11-09T01:00:00Z' },
  ])
  await page.goto('/')
  await expect(page.getByRole('dialog')).toContainText('First')
  await page.getByRole('button', { name: 'Got it' }).click()
  await expect(page.getByRole('dialog')).toContainText('Second')
  await page.getByRole('button', { name: 'Got it' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.reload()
  await expect(page.getByLabel('Search Kova Maps')).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('the web app reports its version to Tower', async ({ page }) => {
  let body: Record<string, string> | null = null
  await page.route('**/rest/v1/app_config*', (r) => r.fulfill({ json: [] }))
  await page.route('**/rest/v1/app_messages*', (r) => r.fulfill({ json: [] }))
  await page.route('**/rest/v1/rpc/report_client', (r) => {
    body = r.request().postDataJSON()
    return r.fulfill({ status: 204, body: '' })
  })
  await page.goto('/')
  await expect.poll(() => body?.platform).toBe('web')
  expect(body!.app_version).toBe('1.0.0')
  expect(body!.install_id).toMatch(/^[0-9a-f-]{36}$/)
})
