import type {
  JobResponse,
  JobStatusResponse,
  AnalysisResponse,
  ClientClaimAnalysis,
  PerspectiveAnalysis,
  AlethiologyAnalysis,
  BiasIndicators,
  ContentEligibilityResult,
} from '../../src/types/index.ts'

export const DEFAULT_NEWS_VIDEO_URL =
  'https://www.youtube.com/watch?v=PBSNewsHour_BudgetBriefing'
export const DEFAULT_VIDEO_ID = 'PBSNewsHour_BudgetBriefing'
export const DEFAULT_JOB_ID = 'bdd-test-job-1'

export function createMockJob(jobId: string = DEFAULT_JOB_ID): JobResponse {
  return { job_id: jobId }
}

export function createDefaultPerspective(
  perspective: string,
  stance: string = 'Support',
  confidence: number = 0.85,
  explanation: string = `Evidence supporting ${perspective} viewpoint.`,
  evidenceUrl: string = 'https://www.reuters.com/news'
): PerspectiveAnalysis {
  return {
    perspective,
    stance,
    confidence,
    explanation,
    evidence: [
      {
        url: evidenceUrl,
        title: `${perspective} source reference`,
        snippet: explanation,
        source: new URL(evidenceUrl).hostname,
      },
    ],
  }
}

export function createDefaultPerspectives(): Record<string, PerspectiveAnalysis> {
  return {
    Scientific: createDefaultPerspective(
      'Scientific',
      'Support',
      0.9,
      'Budget documents confirm the allocation.',
      'https://www.nature.com/articles/infrastructure-analysis'
    ),
    Journalistic: createDefaultPerspective(
      'Journalistic',
      'Support',
      0.85,
      'Multiple outlets report the same figure.',
      'https://www.reuters.com/world/us/infrastructure-bill-breakdown'
    ),
    'Partisan (Left)': createDefaultPerspective(
      'Partisan (Left)',
      'Refute',
      0.7,
      'Commentators dispute the projection.',
      'https://www.vox.com/policy/infrastructure-spending-analysis'
    ),
    'Partisan (Right)': createDefaultPerspective(
      'Partisan (Right)',
      'Ambiguous',
      0.6,
      'Coverage is mixed.',
      'https://www.foxnews.com/politics/infrastructure-bill-vote'
    ),
  }
}

export function createDefaultAlethiology(): AlethiologyAnalysis {
  return {
    primary_theory: 'Correspondence (Empirical)',
    secondary_theory: null,
    epistemic_summary: 'The speaker grounds the claim in budget documents.',
    quote_evidences: ['allocates 500 billion dollars'],
  }
}

export function createDefaultBiasIndicators(
  deceptionScore: number | null = 2.5
): BiasIndicators {
  return {
    logical_fallacies: [],
    emotional_manipulation: [],
    deception_score: deceptionScore,
  }
}

export function createMockClaim(
  claimText: string = 'The infrastructure bill allocates 500 billion dollars over ten years.',
  overrides?: Partial<ClientClaimAnalysis>
): ClientClaimAnalysis {
  return {
    claim_text: claimText,
    video_timestamp_start: 0,
    video_timestamp_end: 8,
    truth_profile: {
      overall_assessment: 'Likely True',
      perspectives: createDefaultPerspectives(),
      bias_indicators: createDefaultBiasIndicators(),
      alethiology: createDefaultAlethiology(),
      ...overrides?.truth_profile,
    },
    ...overrides,
  }
}

export function createMockCompletedStatus(
  jobId: string = DEFAULT_JOB_ID,
  options?: {
    videoId?: string
    claims?: ClientClaimAnalysis[]
    eligibility?: ContentEligibilityResult | null
    analyzedAt?: string
  }
): JobStatusResponse {
  const result: AnalysisResponse = {
    video_id: options?.videoId ?? DEFAULT_VIDEO_ID,
    metadata: {
      analyzed_at: options?.analyzedAt ?? '2026-10-17T12:00:00Z',
    },
    eligibility: options?.eligibility ?? null,
    claims: options?.claims ?? [createMockClaim()],
  }

  return {
    job_id: jobId,
    status: 'completed',
    error: null,
    error_code: null,
    result,
  }
}

export function createMockStreamingStatus(
  jobId: string = DEFAULT_JOB_ID,
  partialClaims: ClientClaimAnalysis[] = [],
  videoId: string = DEFAULT_VIDEO_ID
): JobStatusResponse {
  return {
    job_id: jobId,
    status: 'processing',
    error: null,
    error_code: null,
    result: {
      video_id: videoId,
      metadata: { analyzed_at: '2026-10-17T12:00:00Z' },
      eligibility: null,
      claims: partialClaims,
    },
  }
}

export function createMockIneligibleStatus(
  jobId: string = DEFAULT_JOB_ID,
  details?: {
    category?: string
    title?: string
    message?: string
    confidence?: number
    topics?: string[]
    videoId?: string
  }
): JobStatusResponse {
  const eligibility: ContentEligibilityResult = {
    is_analysable: false,
    confidence_score: details?.confidence ?? 0.95,
    detected_category: details?.category ?? 'Entertainment',
    disclaimer_title: details?.title ?? 'Analysis Skipped',
    disclaimer_message:
      details?.message ??
      'This video appears to contain entertainment content with minimal verifiable claims.',
    key_topics_found: details?.topics ?? ['Gaming', 'Music'],
  }

  return {
    job_id: jobId,
    status: 'completed',
    error: null,
    error_code: null,
    result: {
      video_id: details?.videoId ?? DEFAULT_VIDEO_ID,
      metadata: { analyzed_at: '2026-10-17T12:00:00Z' },
      eligibility,
      claims: [],
    },
  }
}

export function createMockFailedStatus(
  jobId: string = DEFAULT_JOB_ID,
  errorCode: string | null = null,
  errorMessage: string = 'Analysis failed'
): JobStatusResponse {
  return {
    job_id: jobId,
    status: 'failed',
    error: errorMessage,
    error_code: errorCode,
    result: null,
  }
}

export function createMockPendingStatus(
  jobId: string = DEFAULT_JOB_ID
): JobStatusResponse {
  return {
    job_id: jobId,
    status: 'pending',
    error: null,
    error_code: null,
    result: null,
  }
}
