import { useState } from 'react'
import './App.css'

interface ClaimAnalysis {
  claim_text: string
  video_timestamp_start: number | null
  video_timestamp_end: number | null
  truth_profile: {
    overall_assessment: string
    perspectives: Record<string, {
      perspective: string
      stance: string
      confidence: number
      explanation: string
      evidence: Array<{
        url: string
        title: string
        snippet: string
        source: string
      }>
    }>
    bias_indicators: {
      logical_fallacies: string[]
      emotional_manipulation: string[]
      deception_score: number
    }
  }
}

interface AnalysisResponse {
  video_id: string
  metadata: {
    analyzed_at: string
  }
  claims: ClaimAnalysis[]
}

function App() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<AnalysisResponse | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setResults(null)

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'

      // 1. Create Job
      const createResponse = await fetch(`${apiUrl}/analyze/jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
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
      const pollInterval = 2000 // 2 seconds

      const checkStatus = async () => {
        try {
          const statusResponse = await fetch(`${apiUrl}/analyze/jobs/${job_id}`)

          if (!statusResponse.ok) {
            throw new Error('Failed to check job status')
          }

          const statusData = await statusResponse.json()

          if (statusData.status === 'completed') {
            setResults(statusData.result)
            setLoading(false)
          } else if (statusData.status === 'failed') {
            setError(statusData.error || 'Analysis failed')
            setLoading(false)
          } else {
            // Still processing, poll again
            setTimeout(checkStatus, pollInterval)
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Error checking status')
          setLoading(false)
        }
      }

      // Start polling
      checkStatus()

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setLoading(false)
    }
  }

  const getAssessmentClass = (assessment: string) => {
    const normalized = assessment.toLowerCase().replace(/\s+/g, '-')
    return `overall-assessment assessment-${normalized}`
  }

  const getStanceClass = (stance: string) => {
    return `stance stance-${stance.toLowerCase()}`
  }

  const formatTimestamp = (start: number | null, end: number | null) => {
    if (start === null) return 'N/A'
    const formatTime = (seconds: number) => {
      const mins = Math.floor(seconds / 60)
      const secs = Math.floor(seconds % 60)
      return `${mins}:${secs.toString().padStart(2, '0')}`
    }
    if (end === null) return formatTime(start)
    return `${formatTime(start)} - ${formatTime(end)}`
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
            disabled={loading}
          >
            {loading ? 'Analyzing...' : 'Analyze'}
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

          {results.claims.map((claimAnalysis, index) => (
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

              <div className="perspectives-section">
                <h3>Perspective Analysis</h3>
                <div className="perspectives-grid">
                  {Object.entries(claimAnalysis.truth_profile.perspectives).map(([key, perspective]) => (
                    <div key={key} className="perspective-card">
                      <div className="perspective-header">
                        <span className="perspective-name">{perspective.perspective}</span>
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
                  ))}
                </div>
              </div>

              <div className="bias-section">
                <h3>Deception Analysis</h3>
                <div className="deception-rating">
                  <div className="deception-score">
                    {claimAnalysis.truth_profile.bias_indicators.deception_score.toFixed(1)}/10
                  </div>
                  <div className="deception-rationale">
                    Deception Score: {claimAnalysis.truth_profile.bias_indicators.deception_score > 7 ? 'High' : claimAnalysis.truth_profile.bias_indicators.deception_score > 4 ? 'Moderate' : 'Low'}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default App
