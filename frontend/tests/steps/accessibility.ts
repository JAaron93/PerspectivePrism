import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import {
  createMockJob,
  createMockPendingStatus,
} from '../support/mock_jobs.ts'

const { Given, When, Then } = createBdd()

const MAX_TAB_ATTEMPTS = 10

When('the user tabs to the YouTube URL input', async ({ page }) => {
  await page.keyboard.press('Tab')
  const urlInput = page.locator('#youtube-url')
  await expect(
    urlInput,
    'Expected YouTube URL input (#youtube-url) to receive focus on first Tab press'
  ).toBeFocused()
})

When(
  'the user types {string} using the keyboard',
  async ({ page }, text: string) => {
    await page.keyboard.type(text)
    const urlInput = page.locator('#youtube-url')
    await expect(urlInput).toHaveValue(text)
  }
)

When('the user presses the Enter key', async ({ page }) => {
  await page.keyboard.press('Enter')
})

When(
  'the user tabs to the BYOK toggle button and presses Enter',
  async ({ page }) => {
    const toggleBtn = page.locator('#byok-toggle-btn')
    let attempts = 0
    while (
      attempts < MAX_TAB_ATTEMPTS &&
      !(await toggleBtn.evaluate((el) => document.activeElement === el))
    ) {
      await page.keyboard.press('Tab')
      attempts++
    }
    await expect(
      toggleBtn,
      `Expected BYOK toggle button (#byok-toggle-btn) to receive focus within ${MAX_TAB_ATTEMPTS} Tab presses`
    ).toBeFocused()
    await page.keyboard.press('Enter')
  }
)

When(
  'the user tabs to the API key input and enters {string}',
  async ({ page }, key: string) => {
    const keyInput = page.locator('#supadata-key-input')
    let attempts = 0
    while (
      attempts < MAX_TAB_ATTEMPTS &&
      !(await keyInput.evaluate((el) => document.activeElement === el))
    ) {
      await page.keyboard.press('Tab')
      attempts++
    }
    await expect(
      keyInput,
      `Expected Supadata key input (#supadata-key-input) to receive focus within ${MAX_TAB_ATTEMPTS} Tab presses`
    ).toBeFocused()
    await page.keyboard.type(key)
    await expect(keyInput).toHaveValue(key)
  }
)

When(
  'the user tabs to the Save Key button and presses Enter',
  async ({ page }) => {
    const saveBtn = page.locator('#byok-save-btn')
    let attempts = 0
    while (
      attempts < MAX_TAB_ATTEMPTS &&
      !(await saveBtn.evaluate((el) => document.activeElement === el))
    ) {
      await page.keyboard.press('Tab')
      attempts++
    }
    await expect(
      saveBtn,
      `Expected BYOK Save Key button (#byok-save-btn) to receive focus within ${MAX_TAB_ATTEMPTS} Tab presses`
    ).toBeFocused()
    await page.keyboard.press('Enter')
  }
)

Given('the analysis API is processing a submission', async ({ page }) => {
  await page.route('**/analyze/jobs**', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(createMockJob('processing-job-id')),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(createMockPendingStatus('processing-job-id')),
    })
  })
})

Then(
  'the loading indicator has accessible status attributes',
  async ({ page }) => {
    const loading = page.locator('.loading')
    await expect(loading).toBeVisible()
    await expect(loading).toHaveAttribute('role', 'status')
    await expect(loading).toHaveAttribute('aria-live', 'polite')
    await expect(loading.locator('p')).toContainText(
      'Analyzing video transcript... This may take a few minutes. Please wait.'
    )
  }
)

Then('the loading spinner is marked aria-hidden', async ({ page }) => {
  const spinner = page.locator('.loading .spinner')
  await expect(spinner).toHaveAttribute('aria-hidden', 'true')
})

Then(
  'the thinking component has accessible status attributes',
  async ({ page }) => {
    const thinking = page.locator('.thinking-container').first()
    await expect(thinking).toBeVisible()
    await expect(thinking).toHaveAttribute('role', 'status')
    await expect(thinking).toHaveAttribute('aria-live', 'polite')
  }
)

Then('the thinking spinner is marked aria-hidden', async ({ page }) => {
  const spinner = page.locator('.thinking-spinner').first()
  await expect(spinner).toHaveAttribute('aria-hidden', 'true')
})

Then('the error container has role {string}', async ({ page }, role: string) => {
  const errorAlert = page.locator('.error')
  await expect(errorAlert).toBeVisible()
  await expect(errorAlert).toHaveAttribute('role', role)
})
