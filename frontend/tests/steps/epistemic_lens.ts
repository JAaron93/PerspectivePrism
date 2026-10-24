import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import type { TruthTheoryType } from '../../src/types/index.ts'
import {
  createMockJob,
  createMockCompletedStatus,
  createMockClaim,
  createDefaultPerspectives,
  createDefaultBiasIndicators,
} from '../support/mock_jobs.ts'

const { Given, When, Then } = createBdd()

Given(
  'a claim analyzed with primary theory {string} and secondary theory {string}',
  async ({ page }, primaryTheory: string, secondaryTheory: string) => {
    const claim = createMockClaim('Claim with dual epistemological classification.', {
      truth_profile: {
        overall_assessment: 'Likely True',
        perspectives: createDefaultPerspectives(),
        bias_indicators: createDefaultBiasIndicators(2.0),
        alethiology: {
          primary_theory: primaryTheory as TruthTheoryType,
          secondary_theory: secondaryTheory as TruthTheoryType,
          epistemic_summary:
            'The claim is grounded in empirical verification with strong narrative coherence.',
          quote_evidences: ['allocates 500 billion dollars over ten years'],
        },
      },
    })

    await page.route('**/analyze/jobs**', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(createMockJob('dual-theory-job')),
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          createMockCompletedStatus('dual-theory-job', {
            claims: [claim],
          })
        ),
      })
    })
  }
)

Then(
  'the epistemic lens title displays {string} with subtitle {string}',
  async ({ page }, title: string, subtitle: string) => {
    await expect(page.locator('.epistemic-lens-title')).toHaveText(title)
    await expect(page.locator('.epistemic-lens-subtitle')).toHaveText(subtitle)
  }
)

Then(
  'the primary theory chip displays {string} with class {string}',
  async ({ page }, expectedText: string, expectedClass: string) => {
    const primaryChip = page.locator('.theory-chip.primary-theory')
    await expect(primaryChip).toHaveText(expectedText)
    await expect(primaryChip).toHaveClass(new RegExp(expectedClass))
  }
)

Then(
  'the secondary theory chip displays {string} with class {string}',
  async ({ page }, expectedText: string, expectedClass: string) => {
    const secondaryChip = page.locator('.theory-chip.secondary-theory')
    await expect(secondaryChip).toHaveText(expectedText)
    await expect(secondaryChip).toHaveClass(new RegExp(expectedClass))
  }
)

Given(
  'a claim analyzed with epistemic summary {string}',
  async ({ page }, summary: string) => {
    const claim = createMockClaim('Claim with detailed epistemic summary.', {
      truth_profile: {
        overall_assessment: 'Likely True',
        perspectives: createDefaultPerspectives(),
        bias_indicators: createDefaultBiasIndicators(2.0),
        alethiology: {
          primary_theory: 'Correspondence (Empirical)',
          secondary_theory: null,
          epistemic_summary: summary,
          quote_evidences: [],
        },
      },
    })

    await page.route('**/analyze/jobs**', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(createMockJob('summary-job')),
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          createMockCompletedStatus('summary-job', {
            claims: [claim],
          })
        ),
      })
    })
  }
)

Then(
  'the epistemic summary paragraph displays {string}',
  async ({ page }, expectedSummary: string) => {
    await expect(page.locator('.epistemic-summary')).toHaveText(expectedSummary)
  }
)

Given('a claim analyzed with 2 transcript quote evidences', async ({ page }) => {
  const claim = createMockClaim('Claim with transcript quote references.', {
    truth_profile: {
      overall_assessment: 'Likely True',
      perspectives: createDefaultPerspectives(),
      bias_indicators: createDefaultBiasIndicators(2.0),
      alethiology: {
        primary_theory: 'Correspondence (Empirical)',
        secondary_theory: null,
        epistemic_summary: 'Speaker cites specific figures from published bill text.',
        quote_evidences: [
          'allocates 500 billion dollars over ten years',
          'funds critical infrastructure upgrades across fifty states',
        ],
      },
    },
  })

  await page.route('**/analyze/jobs**', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(createMockJob('quotes-job')),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        createMockCompletedStatus('quotes-job', {
          claims: [claim],
        })
      ),
    })
  })
})

Then(
  'the quote accordion toggle displays {string} with arrow {string}',
  async ({ page }, toggleText: string, arrowChar: string) => {
    const toggle = page.locator('.quote-accordion-toggle')
    await expect(toggle).toBeVisible()
    await expect(toggle).toContainText(toggleText)
    await expect(toggle.locator('.accordion-arrow')).toHaveText(arrowChar)
  }
)

Then('the quote evidences drawer is hidden', async ({ page }) => {
  await expect(page.locator('#quote-evidences-drawer')).toBeHidden()
  await expect(page.locator('.quote-accordion-toggle')).toHaveAttribute(
    'aria-expanded',
    'false'
  )
})

When('the user clicks the quote accordion toggle', async ({ page }) => {
  await page.locator('.quote-accordion-toggle').click()
})

Then('the quote evidences drawer is visible', async ({ page }) => {
  await expect(page.locator('#quote-evidences-drawer')).toBeVisible()
  await expect(page.locator('.quote-accordion-toggle')).toHaveAttribute(
    'aria-expanded',
    'true'
  )
})

Then(
  'the quote accordion toggle displays arrow {string}',
  async ({ page }, arrowChar: string) => {
    await expect(page.locator('.quote-accordion-toggle .accordion-arrow')).toHaveText(
      arrowChar
    )
  }
)

Then('{int} quote blockquotes are rendered', async ({ page }, count: number) => {
  await expect(
    page.locator('#quote-evidences-drawer blockquote.epistemic-quote')
  ).toHaveCount(count)
})

Given('a completed claim analysis with no alethiology data', async ({ page }) => {
  const claim = createMockClaim('Claim without alethiology breakdown.', {
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
        body: JSON.stringify(createMockJob('no-alethiology-job')),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        createMockCompletedStatus('no-alethiology-job', {
          claims: [claim],
        })
      ),
    })
  })
})

Then('no epistemic lens card is rendered in the DOM', async ({ page }) => {
  await expect(page.locator('.epistemic-lens-card')).toHaveCount(0)
})
