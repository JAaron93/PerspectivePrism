import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import {
  DEFAULT_ENTERTAINMENT_VIDEO_URL,
  DEFAULT_ENTERTAINMENT_VIDEO_ID,
  createMockJob,
  createMockIneligibleStatus,
  createMockCompletedStatus,
} from '../support/mock_jobs.ts'

const { Given, When, Then, After } = createBdd()

let lastOverridePayload: { url?: string; force_override?: boolean } | null = null
let releaseOverrideHold: (() => void) | null = null

export function releasePendingOverrideHold() {
  if (releaseOverrideHold) {
    releaseOverrideHold()
    releaseOverrideHold = null
  }
}

After(async () => {
  releasePendingOverrideHold()
})

Given('the analysis API classifies the video as ineligible entertainment', async ({ page }) => {
  await page.route('**/analyze/jobs**', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(createMockJob('ineligible-job-1')),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(createMockIneligibleStatus('ineligible-job-1')),
    })
  })
})

When('the user submits an entertainment video URL', async ({ page }) => {
  if (page.url() === 'about:blank') {
    await page.goto('/')
  }
  await page.getByLabel('YouTube URL').fill(DEFAULT_ENTERTAINMENT_VIDEO_URL)
  await page.getByRole('button', { name: 'Analyze', exact: true }).click()
})

Then('the eligibility disclaimer banner is displayed with a warning icon', async ({ page }) => {
  const banner = page.locator('.eligibility-disclaimer')
  await expect(banner).toBeVisible()
  await expect(banner).toHaveAttribute('role', 'status')
  await expect(banner).toHaveAttribute('aria-live', 'polite')
  await expect(banner.locator('.disclaimer-icon')).toHaveText('⚠️')
})

Then('the disclaimer title is {string}', async ({ page }, title: string) => {
  await expect(page.locator('#disclaimer-title')).toHaveText(title)
})

Then('the detected category badge displays {string}', async ({ page }, badgeText: string) => {
  await expect(page.locator('.disclaimer-category-badge')).toHaveText(badgeText)
})

Then(
  'the detected topic badges display {string} and {string}',
  async ({ page }, topic1: string, topic2: string) => {
    await expect(page.locator('.topics-list .topic-badge')).toHaveText([topic1, topic2])
  }
)

Given('an ineligible video disclaimer is currently displayed', async ({ page }) => {
  await page.route('**/analyze/jobs**', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(createMockJob('ineligible-job-current')),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(createMockIneligibleStatus('ineligible-job-current')),
    })
  })
  await page.goto('/')
  await page.getByLabel('YouTube URL').fill(DEFAULT_ENTERTAINMENT_VIDEO_URL)
  await page.getByRole('button', { name: 'Analyze', exact: true }).click()
  await expect(page.locator('.eligibility-disclaimer')).toBeVisible()
})

Then('an educational tip advises navigating to news or documentary videos', async ({ page }) => {
  const tip = page.locator('.disclaimer-tip')
  await expect(tip).toBeVisible()
  await expect(tip).toContainText(
    'Navigate to a news broadcast, documentary, or political commentary video'
  )
})

When('the user clicks the "Analyze Anyway" button', async ({ page }) => {
  releasePendingOverrideHold()
  let resolvePostReceived: (() => void) | null = null
  const postReceivedPromise = new Promise<void>((resolve) => {
    resolvePostReceived = resolve
  })
  const postHoldPromise = new Promise<void>((resolve) => {
    releaseOverrideHold = resolve
  })

  await page.route('**/analyze/jobs**', async (route) => {
    if (route.request().method() === 'POST') {
      lastOverridePayload = JSON.parse(route.request().postData() || '{}')
      if (resolvePostReceived) {
        resolvePostReceived()
      }
      await postHoldPromise
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(createMockJob('override-job-1')),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        createMockCompletedStatus('override-job-1', {
          videoId: DEFAULT_ENTERTAINMENT_VIDEO_ID,
        })
      ),
    })
  })

  await page.locator('#pp-force-analyze-btn').click()
  await postReceivedPromise
})

Then('a loading indicator is displayed', async ({ page }) => {
  const loadingContainer = page.locator('.loading')
  await expect(loadingContainer).toBeVisible()
  await expect(loadingContainer.locator('.spinner')).toBeVisible()
  await expect(loadingContainer).toContainText('Analyzing video transcript...')
})

Then('the override request payload has force_override set to true', async () => {
  expect(lastOverridePayload).toBeDefined()
  expect(lastOverridePayload?.force_override).toBe(true)
})

Then('the completed analysis results are rendered on the screen', async ({ page }) => {
  try {
    releasePendingOverrideHold()
    await expect(page.locator('.results')).toBeVisible()
    await expect(page.locator('.results-header')).toBeVisible()
    await expect(page.locator('.video-id')).toContainText(DEFAULT_ENTERTAINMENT_VIDEO_ID)
    await expect(page.locator('.claim-text')).toBeVisible()
  } finally {
    releasePendingOverrideHold()
  }
})

Given(
  'an ineligible video disclaimer is displayed for {string}',
  async ({ page }, targetUrl: string) => {
    const videoId = targetUrl.includes('v=')
      ? targetUrl.split('v=')[1]
      : 'GamingVideo_Original'

    await page.route('**/analyze/jobs**', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(createMockJob('ineligible-job-custom')),
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          createMockIneligibleStatus('ineligible-job-custom', { videoId })
        ),
      })
    })
    await page.goto('/')
    await page.getByLabel('YouTube URL').fill(targetUrl)
    await page.getByRole('button', { name: 'Analyze', exact: true }).click()
    await expect(page.locator('.eligibility-disclaimer')).toBeVisible()
  }
)

When('the user edits the input field to {string}', async ({ page }, editedUrl: string) => {
  await page.getByLabel('YouTube URL').fill(editedUrl)
})

Then('the override request payload targets {string}', async ({ page }, expectedUrl: string) => {
  try {
    expect(page.url()).toBeTruthy()
    expect(lastOverridePayload).toBeDefined()
    expect(lastOverridePayload?.url).toBe(expectedUrl)
  } finally {
    releasePendingOverrideHold()
  }
})

Then(
  'the override request payload does not target {string}',
  async ({ page }, notExpectedUrl: string) => {
    try {
      expect(page.url()).toBeTruthy()
      expect(lastOverridePayload).toBeDefined()
      expect(lastOverridePayload?.url).not.toBe(notExpectedUrl)
    } finally {
      releasePendingOverrideHold()
    }
  }
)
