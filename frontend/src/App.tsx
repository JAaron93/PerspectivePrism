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

function App() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<AnalysisResponse | null>(null)

  const startAnalysis = async (targetUrl: string, forceOverride: boolean = false) => {
    setLoading(true)
    setIsStreaming(false)
    setError(null)
    if (forceOverride) {
      setResults(null)
    }

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'

      // 1. Create Job with optional force_override
      const createResponse = await fetch(`${apiUrl}/analyze/jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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
            setError(statusData.error || 'Analysis failed')
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
          setError(err instanceof Error ? err.message : 'Error checking status')
          setLoading(false)
          setIsStreaming(false)
        }
      }

      // Start polling
      checkStatus()

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setLoading(false)
      setIsStreaming(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    startAnalysis(url, false)
  }

  const handleForceAnalyze = () => {
    startAnalysis(url, true)
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
      </section>

      {loading && (
        <div className="loading">
          <div className="spinner"></div>
          <p>Analyzing video transcript... This may take a few minutes. Please wait.</p>
        </div>
      )}

      {error && (
        <div className="error">
          <strong>Error:</strong> {error}
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
