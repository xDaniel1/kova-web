import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }

test('signed-out users can choose Apple and keep the web return URL', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  const chooser = page.getByRole('dialog', { name: 'Sign in to Kova Maps' })
  await expect(chooser.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
  await expect(chooser.locator('.version-line')).toContainText(version)
  let requested = ''
  await page.route('**/auth/v1/authorize?**', async route => { requested = route.request().url(); await route.fulfill({ status: 200, body: 'OAuth provider boundary' }) })
  await chooser.getByRole('button', { name: 'Continue with Apple' }).click()
  await expect.poll(() => requested).toContain('provider=apple')
  const url = new URL(requested)
  expect(url.searchParams.get('redirect_to')).toBe('http://localhost:4173/')
})

test('provider chooser can be dismissed with Escape', async ({ page }) => {
  await page.goto('/')
  const trigger = page.getByRole('button', { name: 'Sign in', exact: true })
  await trigger.click()
  await page.getByRole('button', { name: 'Continue with Apple' }).focus()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Sign in to Kova Maps' })).toHaveCount(0)
})
