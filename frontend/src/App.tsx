import { useState } from 'react'
import './App.css'

import { ThinkingComponent } from './components/ThinkingComponent'
import { EligibilityDisclaimer } from './components/EligibilityDisclaimer'
import { EpistemicLensCard } from './components/EpistemicLensCard'
import { formatTimestamp } from './utils/time'
import type { AnalysisResponse, JobStatusResponse } from './types'

const ALL_PERSPECTIVES = [
  "Scientific",
  "Journalistic",
  "Partisan (Left)",
  "Partisan (Right)"
] as const

const getLocalStorage = (): Storage | null => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage
    }
    if (typeof localStorage !== 'undefined') {
      return localStorage
    }
  } catch {
    // ignore
  }
  return null
}

export interface AppProps {
  initialUrl?: string;
  initialSupadataKey?: string;
  initialLoading?: boolean;
  initialError?: string | null;
  initialResults?: AnalysisResponse | null;
  initialShowKeyInput?: boolean;
  onInit?: (actions: {
    startAnalysis: (targetUrl: string, forceOverride?: boolean) => Promise<void>;
  }) => void;
  onErrorChange?: (error: string | null) => void;
}

export function getJobErrorMessage(statusData: JobStatusResponse): { message: string; showKeyInput?: boolean } {
  if (statusData.error_code === 'SUPADATA_KEY_REQUIRED') {
    return {
      message:
        'A Supadata API key is required to retrieve transcripts. Please enter your API key in the settings below or sign up for a free key at supadata.ai (100 free fetches/month).',
      showKeyInput: true,
    }
  }
  if (statusData.error_code === 'SUPADATA_QUOTA_EXHAUSTED') {
    return {
      message:
        'Your Supadata monthly transcript quota has been reached (100 free fetches/month). Please upgrade your plan at supadata.ai/pricing or provide a different key.',
    }
  }
  return {
    message: statusData.error || 'Analysis failed',
  }
}

function App({
  initialUrl = '',
  initialSupadataKey,
  initialLoading = false,
  initialError = null,
  initialResults = null,
  initialShowKeyInput = false,
  onInit,
  onErrorChange,
}: AppProps = {}) {
  const [url, setUrl] = useState(initialUrl)
  const [analyzedUrl, setAnalyzedUrl] = useState('')
  const [loading, setLoading] = useState(initialLoading)
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(initialError)
  const [results, setResults] = useState<AnalysisResponse | null>(initialResults)
  const [supadataKey, setSupadataKey] = useState<string>(() => {
    if (initialSupadataKey !== undefined) return initialSupadataKey
    const storage = getLocalStorage()
    return (storage && storage.getItem('perspective_prism_supadata_key')) || ''
  })
  const [showKeyInput, setShowKeyInput] = useState(initialShowKeyInput)
  const [showKeySecret, setShowKeySecret] = useState(false)
  const [keySavedMessage, setKeySavedMessage] = useState<string | null>(null)

  const updateError = (newError: string | null) => {
    setError(newError)
    if (onErrorChange) {
      onErrorChange(newError)
    }
  }

  const handleSaveKey = (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const storage = getLocalStorage()
      if (storage) {
        storage.setItem('perspective_prism_supadata_key', supadataKey.trim())
        setKeySavedMessage('API Key saved.')
        setTimeout(() => setKeySavedMessage(null), 3000)
      }
    } catch {
      setKeySavedMessage('Failed to save API key to local storage.')
    }
  }

  const handleClearKey = () => {
    setSupadataKey('')
    try {
      const storage = getLocalStorage()
      if (storage) {
        storage.removeItem('perspective_prism_supadata_key')
        setKeySavedMessage('API Key cleared.')
        setTimeout(() => setKeySavedMessage(null), 3000)
      }
    } catch {
      // ignore
    }
  }

  const startAnalysis = async (targetUrl: string, forceOverride: boolean = false) => {
    setLoading(true)
    setIsStreaming(false)
    updateError(null)
    setResults(null)
    setAnalyzedUrl(targetUrl)

    try {
      const apiUrl = import.meta.env?.VITE_API_URL || 'http://localhost:8000'

      const storage = getLocalStorage()
      const activeKey = (storage && storage.getItem('perspective_prism_supadata_key')) || supadataKey

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (activeKey && activeKey.trim()) {
        headers['X-Supadata-Key'] = activeKey.trim()
      }

      // 1. Create Job with optional force_override
      const createResponse = await fetch(`${apiUrl}/analyze/jobs`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          url: targetUrl,
          force_override: forceOverride,
        }),
      })

      if (!createResponse.ok) {
        throw new Error('Failed to start analysis job')
      }

      const responseData = await createResponse.json()
      if (!responseData.job_id) {
        throw new Error('Invalid response: missing job_id')
      }
      const { job_id } = responseData

      // 2. Poll for Status
      const INITIAL_POLL_INTERVAL = 1000
      const MAX_POLL_INTERVAL = 30000
      let currentPollInterval = INITIAL_POLL_INTERVAL
      let lastClaimsCount = 0

      const checkStatus = async () => {
        try {
          const statusResponse = await fetch(`${apiUrl}/analyze/jobs/${job_id}`)

          if (!statusResponse.ok) {
            throw new Error('Failed to check job status')
          }

          const statusData: JobStatusResponse = await statusResponse.json()
          let progressDetected = false

          // Always update results if available (even if partial or ineligible)
          if (statusData.result) {
            const currentClaimsCount = statusData.result.claims ? statusData.result.claims.length : 0
            if (currentClaimsCount > lastClaimsCount) {
              progressDetected = true
              lastClaimsCount = currentClaimsCount
            }
            
            setResults(statusData.result)

            // If the video was determined ineligible by the Pre-Classification Gate, early return
            if (statusData.result.eligibility && !statusData.result.eligibility.is_analysable) {
              setLoading(false)
              setIsStreaming(false)
              return
            }

            // If we have at least one claim, we can stop the "init" loading
            if (currentClaimsCount > 0 && statusData.status !== 'completed') {
              setLoading(false)
              setIsStreaming(true)
            }
          }

          if (statusData.status === 'completed') {
            setLoading(false)
            setIsStreaming(false)
            currentPollInterval = INITIAL_POLL_INTERVAL
          } else if (statusData.status === 'failed') {
            const { message, showKeyInput: shouldShowKey } = getJobErrorMessage(statusData)
            updateError(message)
            if (shouldShowKey) {
              setShowKeyInput(true)
            }
            setLoading(false)
            setIsStreaming(false)
          } else {
            // Still processing
            if (progressDetected) {
              currentPollInterval = INITIAL_POLL_INTERVAL
            } else {
              currentPollInterval = Math.min(currentPollInterval * 2, MAX_POLL_INTERVAL)
            }
            
            // Poll again
            setTimeout(checkStatus, currentPollInterval)
          }
        } catch (err) {
          updateError(err instanceof Error ? err.message : 'Error checking status')
          setLoading(false)
          setIsStreaming(false)
        }
      }

      // Start polling
      await checkStatus()

    } catch (err) {
      updateError(err instanceof Error ? err.message : 'An error occurred')
      setLoading(false)
      setIsStreaming(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    startAnalysis(url, false)
  }

  const handleForceAnalyze = () => {
    const target = analyzedUrl || url
    if (target) {
      startAnalysis(target, true)
    }
  }

  const getAssessmentClass = (assessment: string) => {
    const normalized = assessment.toLowerCase().replace(/\s+/g, '-')
    return `overall-assessment assessment-${normalized}`
  }

  const getStanceClass = (stance: string) => {
    return `stance stance-${stance.toLowerCase()}`
  }

  const getDeceptionLevel = (score: number | null) => {
    if (score === null) return null
    if (score > 7) return 'High'
    if (score > 4) return 'Moderate'
    return 'Low'
  }

  const isIneligible = Boolean(
    results?.eligibility && !results.eligibility.is_analysable
  )

  if (onInit) {
    onInit({ startAnalysis })
  }

  return (
    <div className="app">
      <header className="header">
        <h1>Perspective Prism</h1>
        <p>Analyze YouTube videos for claims, bias, and perspective-based truth</p>
      </header>

      <section className="input-section">
        <form className="input-form" onSubmit={handleSubmit}>
          <div className="input-wrapper">
            <label htmlFor="youtube-url">YouTube URL</label>
            <input
              id="youtube-url"
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              required
            />
          </div>
          <button
            type="submit"
            className="analyze-button"
            disabled={loading || isStreaming}
          >
            {loading ? 'Analyzing...' : isStreaming ? 'Streaming...' : 'Analyze'}
          </button>
        </form>

        <div className="byok-settings">
          <button
            type="button"
            className="byok-toggle-btn"
            onClick={() => setShowKeyInput(!showKeyInput)}
            aria-expanded={showKeyInput}
            id="byok-toggle-btn"
          >
            🔑 {supadataKey ? 'Supadata API Key (Configured)' : 'Configure Supadata API Key (BYOK)'} {showKeyInput ? '▲' : '▼'}
          </button>

          {showKeyInput && (
            <div className="byok-card" id="byok-config-panel">
              <p className="byok-description">
                Perspective Prism uses Supadata to fetch YouTube transcripts without cloud IP blocking.
                Free tier includes 100 fetches/month with no credit card required.
              </p>
              <form onSubmit={handleSaveKey} className="byok-form">
                <div className="byok-input-wrapper">
                  <label htmlFor="supadata-key-input">Supadata API Key</label>
                  <div className="byok-input-row">
                    <input
                      id="supadata-key-input"
                      type={showKeySecret ? 'text' : 'password'}
                      value={supadataKey}
                      onChange={(e) => setSupadataKey(e.target.value)}
                      placeholder="Paste your Supadata API key here"
                      autoComplete="off"
                      spellCheck="false"
                    />
                    <button
                      type="button"
                      className="byok-visibility-btn"
                      onClick={() => setShowKeySecret(!showKeySecret)}
                      aria-label={showKeySecret ? 'Hide API key' : 'Show API key'}
                    >
                      {showKeySecret ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>
                <div className="byok-actions">
                  <button type="submit" className="byok-save-btn" id="byok-save-btn">
                    Save Key
                  </button>
                  <a
                    href="https://supadata.ai"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="byok-link-btn"
                  >
                    Get Free Key ↗
                  </a>
                  {supadataKey && (
                    <button
                      type="button"
                      className="byok-clear-btn"
                      onClick={handleClearKey}
                    >
                      Clear
                    </button>
                  )}
                </div>
                {keySavedMessage && (
                  <p className="byok-status-message" aria-live="polite">
                    {keySavedMessage}
                  </p>
                )}
              </form>
            </div>
          )}
        </div>
      </section>

      {loading && (
        <div className="loading">
          <div className="spinner"></div>
          <p>Analyzing video transcript... This may take a few minutes. Please wait.</p>
        </div>
      )}

      {error && (
        <div className="error" role="alert">
          <strong>Error:</strong> {error}
          {error.includes('supadata.ai/pricing') && (
            <div className="error-actions">
              <a
                href="https://supadata.ai/pricing"
                target="_blank"
                rel="noopener noreferrer"
                className="error-link-btn"
              >
                Upgrade Plan at Supadata ↗
              </a>
            </div>
          )}
          {error.includes('supadata.ai') && !error.includes('pricing') && (
            <div className="error-actions">
              <a
                href="https://supadata.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="error-link-btn"
              >
                Get Free Key at Supadata.ai ↗
              </a>
              <button
                type="button"
                onClick={() => setShowKeyInput(true)}
                className="error-action-btn"
              >
                Enter API Key
              </button>
            </div>
          )}
        </div>
      )}

      {results && (
        <div className="results">
          <div className="results-header">
            <h2>Analysis Results</h2>
            <span className="video-id">Video ID: {results.video_id}</span>
          </div>

          {isIneligible && results.eligibility ? (
            <EligibilityDisclaimer
              eligibility={results.eligibility}
              onForceAnalyze={handleForceAnalyze}
              loading={loading}
            />
          ) : (
            results.claims.map((claimAnalysis, index) => (
              <div key={`claim-${index}`} className="truth-profile">
                <div className="claim-header">
                  <h3>Claim {index + 1}</h3>
                  <p className="claim-text">{claimAnalysis.claim_text}</p>
                  <div className="timestamp">
                    {formatTimestamp(claimAnalysis.video_timestamp_start, claimAnalysis.video_timestamp_end)}
                  </div>
                </div>

                <div className={getAssessmentClass(claimAnalysis.truth_profile.overall_assessment)}>
                  {claimAnalysis.truth_profile.overall_assessment}
                </div>

                <EpistemicLensCard
                  alethiology={claimAnalysis.truth_profile.alethiology}
                  isStreaming={isStreaming}
                />

                <div className="perspectives-section">
                  <h3>Perspective Analysis</h3>
                  <div className="perspectives-grid">
                    {ALL_PERSPECTIVES.map((perspectiveName) => {
                      const perspective = claimAnalysis.truth_profile.perspectives[perspectiveName]
                      
                      if (!perspective) {
                         return (
                           <div key={perspectiveName} className="perspective-card">
                              <div className="perspective-header">
                                <span className="perspective-name">{perspectiveName}</span>
                              </div>
                              <ThinkingComponent context={`Analyzing ${perspectiveName} perspective...`} />
                           </div>
                         )
                      }

                      return (
                      <div key={perspectiveName} className="perspective-card">
                        <div className="perspective-header">
                          <span className="perspective-name">{perspectiveName}</span>
                          <span className={getStanceClass(perspective.stance)}>
                            {perspective.stance}
                          </span>
                        </div>

                        <div className="confidence">
                          Confidence: {(perspective.confidence * 100).toFixed(0)}%
                        </div>

                        <div className="confidence-bar">
                          <div
                            className="confidence-fill"
                            style={{ width: `${perspective.confidence * 100}%` }}
                          />
                        </div>

                        <p className="explanation">{perspective.explanation}</p>
                      </div>
                    )})}
                  </div>
                </div>

                <div className="bias-section">
                  <h3>Deception Analysis</h3>
                  <div className="deception-rating">
                    <div className="deception-score">
                      {claimAnalysis.truth_profile.bias_indicators.deception_score !== null
                        ? claimAnalysis.truth_profile.bias_indicators.deception_score.toFixed(1) + '/10' 
                        : '-/10'}
                    </div>
                    <div className="deception-rationale">
                      {claimAnalysis.truth_profile.bias_indicators.deception_score === null
                       ? <span className="analyzing-bias">Analyzing bias patterns...</span>
                       : `Deception Score: ${getDeceptionLevel(claimAnalysis.truth_profile.bias_indicators.deception_score)}`
                      }
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default App
