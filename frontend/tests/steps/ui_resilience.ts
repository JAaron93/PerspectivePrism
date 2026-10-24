import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import {
  createMockJob,
  createMockCompletedStatus,
  createMockClaim,
  DEFAULT_VIDEO_ID,
} from '../support/mock_jobs.ts'

const { Given, Then } = createBdd()

export const LONG_CLAIM_TEXT =
  'The comprehensive federal infrastructure investment package, enacted following bipartisan negotiations across both legislative chambers, explicitly allocates over five hundred billion dollars in direct federal appropriations over the coming decade for highway reconstruction, transit systems modernization, clean energy grid development, rural broadband expansion, municipal water treatment facilities upgrade, and coastal flood resiliency initiatives across all fifty states and territories. The statutory framework establishes rigorous accountability benchmarks and multi-perspective oversight mechanisms to verify expenditure transparency.'

Given('an analysis job that completes with an empty claims array', async ({ page }) => {
  await page.route('**/analyze/jobs**', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(createMockJob('empty-claims-job')),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        createMockCompletedStatus('empty-claims-job', {
          claims: [],
        })
      ),
    })
  })
})

Then('the results header shows the analyzed video ID', async ({ page }) => {
  await expect(page.locator('.results')).toBeVisible()
  await expect(page.locator('.results-header')).toBeVisible()
  await expect(page.locator('.video-id')).toContainText(DEFAULT_VIDEO_ID)
})

Then('no truth profile cards are rendered', async ({ page }) => {
  await expect(page.locator('.truth-profile')).toHaveCount(0)
})

Then('no error alert is displayed', async ({ page }) => {
  await expect(page.locator('.error[role="alert"]')).toHaveCount(0)
})

Given('an analysis job with a 500 character claim text', async ({ page }) => {
  const longClaim = createMockClaim(LONG_CLAIM_TEXT)

  await page.route('**/analyze/jobs**', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(createMockJob('long-claim-job')),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        createMockCompletedStatus('long-claim-job', {
          claims: [longClaim],
        })
      ),
    })
  })
})

Then('the full 500 character claim text is rendered in the DOM', async ({ page }) => {
  const claimTextLocator = page.locator('.claim-text')
  await expect(claimTextLocator).toBeVisible()
  await expect(claimTextLocator).toHaveText(LONG_CLAIM_TEXT)

  // Verify element does not suffer from horizontal overflow or clipping
  const layoutMetrics = await claimTextLocator.evaluate((el) => {
    const style = window.getComputedStyle(el)
    return {
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      overflowX: style.overflowX,
      overflowY: style.overflowY,
      textOverflow: style.textOverflow,
    }
  })

  // Horizontal overflow check: content must fit within client width
  expect(layoutMetrics.scrollWidth).toBeLessThanOrEqual(layoutMetrics.clientWidth)

  // Vertical clipping check: content must not be clipped by a constrained container
  expect(layoutMetrics.scrollHeight).toBeLessThanOrEqual(layoutMetrics.clientHeight)

  // Truncation check: ensure ellipsis and hidden clipping are not active
  expect(layoutMetrics.textOverflow).not.toBe('ellipsis')
  expect(layoutMetrics.overflowY).not.toBe('hidden')

  // Bounding box check: long text should wrap across multiple lines
  const boundingBox = await claimTextLocator.boundingBox()
  expect(boundingBox).not.toBeNull()
  expect(boundingBox!.height).toBeGreaterThan(50)

  // Document horizontal scroll check: page must not develop horizontal overflow
  const pageHasHorizontalOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth
  })
  expect(pageHasHorizontalOverflow).toBe(false)
})

Then('the truth profile container is displayed', async ({ page }) => {
  await expect(page.locator('.truth-profile')).toBeVisible()
  await expect(page.locator('.claim-header h3')).toHaveText('Claim 1')
})
