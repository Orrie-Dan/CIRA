import { test, expect } from '@playwright/test'

test.describe('CIRA public flows', () => {
  test('landing page loads', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/CIRA|Citizen|Infrastructure/i)
  })

  test('login page is reachable', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('button', { name: /sign in|log in/i })).toBeVisible()
  })

  test('protected admin route redirects when unauthenticated', async ({ page }) => {
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/login/)
  })
})
