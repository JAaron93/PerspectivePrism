import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import {
  createMockJob,
  createMockCompletedStatus,
  createMockClaim,
  createDefaultPerspectives,
  createDefaultBiasIndicators,
  createDefaultAlethiology,
} from '../support/mock_jobs.ts'

const { Given, Then } = createBdd()

Given('an analysis job containing two distinct claims', async ({ page }) => {
  const claim1 = createMockClaim(
    'The infrastructure bill allocates 500 billion dollars over ten years.',
    {
      video_timestamp_start: 0,
      video_timestamp_end: 8,
      truth_profile: {
        overall_assessment: 'Likely True',
        perspectives: createDefaultPerspectives(),
        bias_indicators: createDefaultBiasIndicators(2.5),
        alethiology: createDefaultAlethiology(),
      },
    }
  )

  const claim2 = createMockClaim(
    'Inflation will decrease by three percent by next quarter.',
    {
      video_timestamp_start: 12,
      video_timestamp_end: 25,
      truth_profile: {
        overall_assessment: 'Mixed',
        perspectives: createDefaultPerspectives(),
        bias_indicators: createDefaultBiasIndicators(5.0),
        alethiology: createDefaultAlethiology(),
      },
    }
  )

  await page.route('**/analyze/jobs**', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(createMockJob('two-claims-job')),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        createMockCompletedStatus('two-claims-job', {
          claims: [claim1, claim2],
        })
      ),
    })
  })
})

Then(
  'ordinal heading {string} is rendered with timestamp {string}',
  async ({ page }, heading: string, timestamp: string) => {
    const profile = page.locator('.truth-profile', {
      has: page.locator('.claim-header h3', { hasText: heading }),
    })
    await expect(profile).toBeVisible()
    await expect(profile.locator('.claim-header h3')).toHaveText(heading)
    await expect(profile.locator('.timestamp')).toHaveText(timestamp)
  }
)

Given(
  'completed claims with verdicts "Likely True", "Likely False", and "Mixed"',
  async ({ page }) => {
    const claims = [
      createMockClaim('First claim with high confidence evidence.', {
        truth_profile: {
          overall_assessment: 'Likely True',
          perspectives: createDefaultPerspectives(),
          bias_indicators: createDefaultBiasIndicators(1.5),
          alethiology: createDefaultAlethiology(),
        },
      }),
      createMockClaim('Second claim refuted by official documents.', {
        truth_profile: {
          overall_assessment: 'Likely False',
          perspectives: createDefaultPerspectives(),
          bias_indicators: createDefaultBiasIndicators(8.0),
          alethiology: createDefaultAlethiology(),
        },
      }),
      createMockClaim('Third claim with conflicting partisan reporting.', {
        truth_profile: {
          overall_assessment: 'Mixed',
          perspectives: createDefaultPerspectives(),
          bias_indicators: createDefaultBiasIndicators(4.5),
          alethiology: createDefaultAlethiology(),
        },
      }),
    ]

    await page.route('**/analyze/jobs**', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(createMockJob('three-verdicts-job')),
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          createMockCompletedStatus('three-verdicts-job', { claims })
        ),
      })
    })
  }
)

Then(
  'the assessment badges apply class names "assessment-likely-true", "assessment-likely-false", and "assessment-mixed"',
  async ({ page }) => {
    const badges = page.locator('.overall-assessment')
    await expect(badges).toHaveCount(3)
    await expect(badges.nth(0)).toHaveClass(/assessment-likely-true/)
    await expect(badges.nth(1)).toHaveClass(/assessment-likely-false/)
    await expect(badges.nth(2)).toHaveClass(/assessment-mixed/)
  }
)

Given('a completed claim analysis with all 4 perspectives', async ({ page }) => {
  await page.route('**/analyze/jobs**', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(createMockJob('four-perspectives-job')),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        createMockCompletedStatus('four-perspectives-job', {
          claims: [createMockClaim()],
        })
      ),
    })
  })
})

Then('all 4 perspectives are rendered in the perspective grid', async ({ page }) => {
  const cards = page.locator('.perspective-card')
  await expect(cards).toHaveCount(4)
  await expect(page.locator('.perspective-name')).toHaveText([
    'Scientific',
    'Journalistic',
    'Partisan (Left)',
    'Partisan (Right)',
  ])
})

Then(
  'each perspective displays its stance, confidence percentage, and explanation',
  async ({ page }) => {
    await expect(page.locator('.perspective-card .stance')).toHaveText([
      'Support',
      'Support',
      'Refute',
      'Ambiguous',
    ])
    await expect(page.locator('.perspective-card .confidence')).toHaveText([
      'Confidence: 90%',
      'Confidence: 85%',
      'Confidence: 70%',
      'Confidence: 60%',
    ])
    const explanations = page.locator('.perspective-card .explanation')
    await expect(explanations).toHaveCount(4)
    await expect(explanations.nth(0)).toContainText('Budget documents confirm')
  }
)

Then(
  'each perspective displays a confidence fill bar matching its score',
  async ({ page }) => {
    await expect(page.locator('.confidence-fill').nth(0)).toHaveAttribute(
      'style',
      'width: 90%;'
    )
    await expect(page.locator('.confidence-fill').nth(1)).toHaveAttribute(
      'style',
      'width: 85%;'
    )
    await expect(page.locator('.confidence-fill').nth(2)).toHaveAttribute(
      'style',
      'width: 70%;'
    )
    await expect(page.locator('.confidence-fill').nth(3)).toHaveAttribute(
      'style',
      'width: 60%;'
    )
  }
)

Given('a claim with deception score 8.5', async ({ page }) => {
  const claim = createMockClaim('Claim with high deception indicators.', {
    truth_profile: {
      overall_assessment: 'Likely False',
      perspectives: createDefaultPerspectives(),
      bias_indicators: createDefaultBiasIndicators(8.5),
      alethiology: createDefaultAlethiology(),
    },
  })

  await page.route('**/analyze/jobs**', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(createMockJob('high-deception-job')),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        createMockCompletedStatus('high-deception-job', {
          claims: [claim],
        })
      ),
    })
  })
})

Then('the deception score displays {string}', async ({ page }, expectedScore: string) => {
  await expect(page.locator('.deception-score')).toHaveText(expectedScore)
})

Then(
  'the deception rationale displays {string}',
  async ({ page }, expectedRationale: string) => {
    await expect(page.locator('.deception-rationale')).toHaveText(expectedRationale)
  }
)
