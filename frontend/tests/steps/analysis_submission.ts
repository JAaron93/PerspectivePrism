import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import {
  DEFAULT_NEWS_VIDEO_URL as NEWS_VIDEO_URL,
  createMockJob,
  createMockCompletedStatus,
  createMockStreamingStatus,
  createMockClaim,
} from '../support/mock_jobs.ts'

const { Given, When, Then } = createBdd()

const JOB_ID = 'bdd-smoke-job-1'
const CREATE_JOB_RESPONSE = createMockJob(JOB_ID)
const COMPLETED_JOB_STATUS = createMockCompletedStatus(JOB_ID)

let interceptedPostCount = 0
let streamPhase: 'analyzing' | 'streaming' | 'completed' = 'analyzing'

Given('the analysis API will answer with a completed news-video job', async ({ page }) => {
  await page.route('**/analyze/jobs**', async (route) => {
    if (route.request().method() === 'POST') {
      interceptedPostCount++
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(CREATE_JOB_RESPONSE),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(COMPLETED_JOB_STATUS),
    })
  })
})

Given('the user navigates to the Perspective Prism web app', async ({ page }) => {
  await page.goto('/')
})

When('the user submits the form with an empty YouTube URL', async ({ page }) => {
  interceptedPostCount = 0
  await page.locator('#youtube-url').fill('')
  await page.getByRole('button', { name: 'Analyze', exact: true }).click()
})

Then('the browser prevents submission via HTML5 validation', async ({ page }) => {
  const isValid = await page.locator('#youtube-url').evaluate(
    (el: HTMLInputElement) => el.checkValidity()
  )
  expect(isValid).toBe(false)
})

Then('no analysis job request is sent to the backend', async () => {
  expect(interceptedPostCount).toBe(0)
})

Given('the analysis API will stream partial claims before completing', async ({ page }) => {
  streamPhase = 'analyzing'
  await page.route('**/analyze/jobs**', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(createMockJob('stream-job-1')),
      })
      return
    }
    if (streamPhase === 'analyzing') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(createMockStreamingStatus('stream-job-1', [])),
      })
      return
    }
    if (streamPhase === 'streaming') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          createMockStreamingStatus('stream-job-1', [createMockClaim()])
        ),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        createMockCompletedStatus('stream-job-1', {
          claims: [createMockClaim()],
        })
      ),
    })
  })
})

Then('the submit button is disabled', async ({ page }) => {
  await expect(page.locator('.analyze-button')).toBeDisabled()
})

Then('the submit button displays {string}', async ({ page }, buttonText: string) => {
  await expect(page.locator('.analyze-button')).toHaveText(buttonText)
})

When('the backend streams partial claims', async () => {
  streamPhase = 'streaming'
})

When('the job finishes processing', async () => {
  streamPhase = 'completed'
})

Then('the submit button is enabled', async ({ page }) => {
  await expect(page.locator('.analyze-button')).toBeEnabled()
})

Given('a previous analysis has rendered results on the screen', async ({ page }) => {
  await page.route('**/analyze/jobs**', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(createMockJob('prev-job')),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(createMockCompletedStatus('prev-job')),
    })
  })
  await page.goto('/')
  await page.getByLabel('YouTube URL').fill(NEWS_VIDEO_URL)
  await page.getByRole('button', { name: 'Analyze', exact: true }).click()
  await expect(page.locator('.results')).toBeVisible()
})

When('the user submits a new YouTube news video URL', async ({ page }) => {
  // Mock subsequent job with slow status so we observe the immediate results wipe
  await page.route('**/analyze/jobs**', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(createMockJob('subsequent-job')),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(createMockStreamingStatus('subsequent-job', [])),
    })
  })
  await page
    .getByLabel('YouTube URL')
    .fill('https://www.youtube.com/watch?v=Reuters_ClimateSummit')
  await page.getByRole('button', { name: 'Analyze', exact: true }).click()
})

Then('the previous results are immediately removed from the DOM', async ({ page }) => {
  await expect(page.locator('.results')).toHaveCount(0)
})

When('the user submits a YouTube news video URL', async ({ page }) => {
  if (page.url() === 'about:blank') {
    await page.goto('/')
  }
  await page.getByLabel('YouTube URL').fill(NEWS_VIDEO_URL)
  await page.getByRole('button', { name: 'Analyze', exact: true }).click()
})

Then('the results header shows the analyzed video', async ({ page }) => {
  await expect(page.locator('.results-header')).toContainText('Analysis Results')
  await expect(page.locator('.video-id')).toContainText('PBSNewsHour_BudgetBriefing')
})

Then('the claim text is rendered', async ({ page }) => {
  await expect(page.locator('.claim-text')).toContainText('500 billion dollars')
})

Then('the overall assessment verdict is displayed', async ({ page }) => {
  await expect(page.locator('.overall-assessment')).toHaveText('Likely True')
})

Then('all 4 perspectives are rendered with their stances', async ({ page }) => {
  await expect(page.locator('.perspective-card')).toHaveCount(4)
  await expect(page.locator('.stance')).toHaveText(['Support', 'Support', 'Refute', 'Ambiguous'])
})

Then('the deception score is rendered', async ({ page }) => {
  await expect(page.locator('.deception-score')).toHaveText('2.5/10')
})
