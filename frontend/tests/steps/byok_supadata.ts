import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import {
  createMockJob,
  createMockCompletedStatus,
} from '../support/mock_jobs.ts'

const { Given, When, Then } = createBdd()

let capturedPostHeadersPromise: Promise<Record<string, string>>
let resolveCapturedPostHeaders: (headers: Record<string, string>) => void

Given('the user is on the main page with unconfigured BYOK settings', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.removeItem('perspective_prism_supadata_key')
  })
  await page.goto('/')
})

Then('the toggle button displays {string}', async ({ page }, text: string) => {
  await expect(page.locator('#byok-toggle-btn')).toContainText(text)
})

When('the user clicks the BYOK toggle button', async ({ page }) => {
  await page.locator('#byok-toggle-btn').click()
})

Then('the BYOK configuration panel is expanded', async ({ page }) => {
  await expect(page.locator('#byok-config-panel')).toBeVisible()
})

Then('the BYOK configuration panel is collapsed', async ({ page }) => {
  await expect(page.locator('#byok-config-panel')).toBeHidden()
})

Then('the toggle button has aria-expanded set to true', async ({ page }) => {
  await expect(page.locator('#byok-toggle-btn')).toHaveAttribute('aria-expanded', 'true')
})

Then('the toggle button has aria-expanded set to false', async ({ page }) => {
  await expect(page.locator('#byok-toggle-btn')).toHaveAttribute('aria-expanded', 'false')
})

Given('the BYOK configuration panel is open', async ({ page }) => {
  const isExpanded = await page.locator('#byok-toggle-btn').getAttribute('aria-expanded')
  if (isExpanded !== 'true') {
    await page.locator('#byok-toggle-btn').click()
  }
  await expect(page.locator('#byok-config-panel')).toBeVisible()
})

When('the user enters {string} into the API key input', async ({ page }, key: string) => {
  await page.locator('#supadata-key-input').fill(key)
})

When('the user clicks "Save Key"', async ({ page }) => {
  await page.locator('#byok-save-btn').click()
})

Then('the trimmed key {string} is stored in localStorage', async ({ page }, expectedKey: string) => {
  const stored = await page.evaluate(() =>
    window.localStorage.getItem('perspective_prism_supadata_key')
  )
  expect(stored).toBe(expectedKey)
})

Then('a status message confirms {string}', async ({ page }, message: string) => {
  await expect(page.locator('.byok-status-message')).toHaveText(message)
})

Then('the API key input has type {string}', async ({ page }, inputType: string) => {
  await expect(page.locator('#supadata-key-input')).toHaveAttribute('type', inputType)
})

When('the user clicks the {string} visibility button', async ({ page }, buttonLabel: string) => {
  await expect(page.locator('.byok-visibility-btn')).toHaveText(buttonLabel)
  await page.locator('.byok-visibility-btn').click()
})

Then('the visibility button label changes to {string}', async ({ page }, label: string) => {
  await expect(page.locator('.byok-visibility-btn')).toHaveText(label)
})

Then('the visibility button has aria-label {string}', async ({ page }, label: string) => {
  await expect(page.locator('.byok-visibility-btn')).toHaveAttribute('aria-label', label)
})

Given('a Supadata API key {string} is saved in localStorage', async ({ page }, key: string) => {
  await page.addInitScript((val) => {
    window.localStorage.setItem('perspective_prism_supadata_key', val)
  }, key)
  await page.goto('/')
})

When('the user opens the BYOK configuration panel', async ({ page }) => {
  await page.locator('#byok-toggle-btn').click()
  await expect(page.locator('#byok-config-panel')).toBeVisible()
})

When('the user clicks the "Clear" button', async ({ page }) => {
  await page.locator('.byok-clear-btn').click()
})

Then('the key is removed from localStorage', async ({ page }) => {
  const stored = await page.evaluate(() =>
    window.localStorage.getItem('perspective_prism_supadata_key')
  )
  expect(stored).toBeNull()
})

Then('the API key input field is emptied', async ({ page }) => {
  await expect(page.locator('#supadata-key-input')).toHaveValue('')
})

Then('the toggle button reverts to {string}', async ({ page }, text: string) => {
  await expect(page.locator('#byok-toggle-btn')).toContainText(text)
})

Given('the analysis API is ready to accept jobs', async ({ page }) => {
  capturedPostHeadersPromise = new Promise((resolve) => {
    resolveCapturedPostHeaders = resolve
  })
  await page.route('**/analyze/jobs**', async (route) => {
    if (route.request().method() === 'POST') {
      const headers = route.request().headers()
      resolveCapturedPostHeaders(headers)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(createMockJob()),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(createMockCompletedStatus()),
    })
  })
})

Given('no Supadata API key is configured', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.removeItem('perspective_prism_supadata_key')
  })
  await page.goto('/')
})

Then(
  'the outbound POST request headers include {string} with value {string}',
  async ({ page }, headerName: string, expectedVal: string) => {
    await expect(page.locator('#youtube-url')).toBeVisible()
    const headers = await capturedPostHeadersPromise
    expect(headers[headerName.toLowerCase()]).toBe(expectedVal)
  }
)

Then(
  'the outbound POST request headers do not include {string}',
  async ({ page }, headerName: string) => {
    await expect(page.locator('#youtube-url')).toBeVisible()
    const headers = await capturedPostHeadersPromise
    expect(headers[headerName.toLowerCase()]).toBeUndefined()
  }
)
