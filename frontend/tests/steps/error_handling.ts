import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import {
  DEFAULT_NEWS_VIDEO_URL as NEWS_VIDEO_URL,
  createMockJob,
  createMockFailedStatus,
} from '../support/mock_jobs.ts'
import { releasePendingPostHold } from './analysis_submission.ts'

const { Given, Then } = createBdd()

Given('the analysis API fails with error code {string}', async ({ page }, errorCode: string) => {
  await page.route('**/analyze/jobs**', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(createMockJob('job-fail')),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        createMockFailedStatus(
          'job-fail',
          errorCode,
          errorCode === 'SUPADATA_KEY_REQUIRED'
            ? 'A Supadata API key is required to retrieve transcripts.'
            : 'Your Supadata monthly transcript quota has been reached.'
        )
      ),
    })
  })
})

Then('an error banner is displayed explaining an API key is required', async ({ page }) => {
  const errorBanner = page.locator('.error[role="alert"]')
  await expect(errorBanner).toBeVisible()
  await expect(errorBanner).toContainText('Supadata API key is required')
})

Then('the BYOK configuration panel is automatically opened', async ({ page }) => {
  await expect(page.locator('#byok-config-panel')).toBeVisible()
  await expect(page.locator('#byok-toggle-btn')).toHaveAttribute('aria-expanded', 'true')
})

Then(
  'an action link directs to {string} pointing to {string}',
  async ({ page }, linkText: string, expectedUrl: string) => {
    const link = page.locator('.error-actions a.error-link-btn', { hasText: linkText })
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('href', expectedUrl)
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  }
)

Then('an "Enter API Key" action button is displayed', async ({ page }) => {
  const btn = page.locator('.error-actions button.error-action-btn', { hasText: 'Enter API Key' })
  await expect(btn).toBeVisible()
})

Then('an error banner is displayed explaining quota exhaustion', async ({ page }) => {
  const errorBanner = page.locator('.error[role="alert"]')
  await expect(errorBanner).toBeVisible()
  await expect(errorBanner).toContainText('monthly transcript quota has been reached')
})

Given('the analysis API fails to create the job with a 500 server error', async ({ page }) => {
  await page.route('**/analyze/jobs**', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Internal Server Error' }),
      })
      return
    }
  })
})

Then('an error alert is rendered stating {string}', async ({ page }, text: string) => {
  const alert = page.locator('.error[role="alert"]')
  await expect(alert).toBeVisible()
  await expect(alert).toContainText(text)
})

Given('an active error banner is displayed', async ({ page }) => {
  await page.route('**/analyze/jobs**', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Internal Server Error' }),
      })
      return
    }
  })
  await page.goto('/')
  await page.getByLabel('YouTube URL').fill(NEWS_VIDEO_URL)
  await page.getByRole('button', { name: 'Analyze', exact: true }).click()
  await expect(page.locator('.error[role="alert"]')).toBeVisible()
})

Then('the active error banner is immediately dismissed', async ({ page }) => {
  try {
    await expect(page.locator('.error')).toHaveCount(0)
  } finally {
    releasePendingPostHold()
  }
})
