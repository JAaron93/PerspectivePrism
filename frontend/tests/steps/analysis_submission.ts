import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import {
  DEFAULT_NEWS_VIDEO_URL as NEWS_VIDEO_URL,
  createMockJob,
  createMockCompletedStatus,
} from '../support/mock_jobs.ts'

const { Given, When, Then } = createBdd()

const JOB_ID = 'bdd-smoke-job-1'
const CREATE_JOB_RESPONSE = createMockJob(JOB_ID)
const COMPLETED_JOB_STATUS = createMockCompletedStatus(JOB_ID)

Given('the analysis API will answer with a completed news-video job', async ({ page }) => {
  await page.route('**/analyze/jobs**', async (route) => {
    if (route.request().method() === 'POST') {
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
