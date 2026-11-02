import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import {
  createMockJob,
  createMockStreamingStatus,
  createMockCompletedStatus,
  createMockClaim,
  createDefaultPerspectives,
  createDefaultBiasIndicators,
  createDefaultAlethiology,
} from '../support/mock_jobs.ts'

const { Given, When, Then } = createBdd()

let streamTransitionPhase: 'streaming' | 'completed' = 'streaming'

Given(
  'a job is streaming a claim with a pending "Scientific" perspective',
  async ({ page }) => {
    const perspectives = createDefaultPerspectives()
    delete perspectives['Scientific']

    const partialClaim = createMockClaim(
      'The infrastructure bill allocates 500 billion dollars over ten years.',
      {
        truth_profile: {
          overall_assessment: 'Likely True',
          perspectives,
          bias_indicators: createDefaultBiasIndicators(2.5),
          alethiology: createDefaultAlethiology(),
        },
      }
    )

    await page.route('**/analyze/jobs**', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(createMockJob('stream-pending-perspective')),
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          createMockStreamingStatus('stream-pending-perspective', [partialClaim])
        ),
      })
    })
  }
)

Then(
  'the {string} perspective displays an active thinking spinner with {string}',
  async ({ page }, perspectiveName: string, expectedContext: string) => {
    const card = page.locator('.perspective-card', {
      has: page.locator('.perspective-name', { hasText: perspectiveName }),
    })
    await expect(card).toBeVisible()
    const thinking = card.locator('.thinking-container')
    await expect(thinking).toBeVisible()
    await expect(thinking).toHaveAttribute('role', 'status')
    await expect(thinking).toHaveAttribute('aria-live', 'polite')
    await expect(thinking.locator('.thinking-spinner')).toBeVisible()
    await expect(thinking.locator('.thinking-text')).toHaveText(expectedContext)
  }
)

Given('a job is streaming a claim with pending alethiology', async ({ page }) => {
  const partialClaim = createMockClaim('Claim with pending alethiology framework.', {
    truth_profile: {
      overall_assessment: 'Likely True',
      perspectives: createDefaultPerspectives(),
      bias_indicators: createDefaultBiasIndicators(2.0),
      alethiology: null,
    },
  })

  await page.route('**/analyze/jobs**', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(createMockJob('stream-pending-alethiology')),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        createMockStreamingStatus('stream-pending-alethiology', [partialClaim])
      ),
    })
  })
})

Then(
  'the epistemic lens displays an active thinking indicator with {string}',
  async ({ page }, expectedContext: string) => {
    const card = page.locator('.epistemic-lens-card.epistemic-lens-loading')
    await expect(card).toBeVisible()
    await expect(card.locator('.epistemic-lens-title')).toHaveText('🔭 Epistemic Lens')
    const thinking = card.locator('.thinking-container')
    await expect(thinking).toBeVisible()
    await expect(thinking).toHaveAttribute('role', 'status')
    await expect(thinking).toHaveAttribute('aria-live', 'polite')
    await expect(thinking.locator('.thinking-spinner')).toBeVisible()
    await expect(thinking.locator('.thinking-text')).toHaveText(expectedContext)
  }
)

Given('a job is streaming a claim with a null deception score', async ({ page }) => {
  const partialClaim = createMockClaim('Claim with pending deception score.', {
    truth_profile: {
      overall_assessment: 'Likely True',
      perspectives: createDefaultPerspectives(),
      bias_indicators: createDefaultBiasIndicators(null),
      alethiology: createDefaultAlethiology(),
    },
  })

  await page.route('**/analyze/jobs**', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(createMockJob('stream-pending-deception')),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        createMockStreamingStatus('stream-pending-deception', [partialClaim])
      ),
    })
  })
})

Given(
  'a job starts in streaming mode with pending perspectives',
  async ({ page }) => {
    streamTransitionPhase = 'streaming'
    const pendingPerspectives = createDefaultPerspectives()
    delete pendingPerspectives['Scientific']

    const partialClaim = createMockClaim(
      'The infrastructure bill allocates 500 billion dollars over ten years.',
      {
        truth_profile: {
          overall_assessment: 'Likely True',
          perspectives: pendingPerspectives,
          bias_indicators: createDefaultBiasIndicators(2.5),
          alethiology: createDefaultAlethiology(),
        },
      }
    )

    const fullClaim = createMockClaim(
      'The infrastructure bill allocates 500 billion dollars over ten years.',
      {
        truth_profile: {
          overall_assessment: 'Likely True',
          perspectives: createDefaultPerspectives(),
          bias_indicators: createDefaultBiasIndicators(2.5),
          alethiology: createDefaultAlethiology(),
        },
      }
    )

    await page.route('**/analyze/jobs**', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(createMockJob('stream-transition-job')),
        })
        return
      }
      if (streamTransitionPhase === 'streaming') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            createMockStreamingStatus('stream-transition-job', [partialClaim])
          ),
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          createMockCompletedStatus('stream-transition-job', {
            claims: [fullClaim],
          })
        ),
      })
    })
  }
)

When('the backend status switches to completed', async () => {
  streamTransitionPhase = 'completed'
})

Then(
  'all thinking indicators are replaced with completed perspective cards',
  async ({ page }) => {
    await expect(page.locator('.thinking-container')).toHaveCount(0)
    const scientificCard = page.locator('.perspective-card', {
      has: page.locator('.perspective-name', { hasText: 'Scientific' }),
    })
    await expect(scientificCard.locator('.stance')).toHaveText('Support')
    await expect(scientificCard.locator('.confidence')).toHaveText('Confidence: 90%')
    await expect(scientificCard.locator('.explanation')).toHaveText(
      'Budget documents confirm the allocation.'
    )
  }
)
