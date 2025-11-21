import { useState } from 'react'
import './App.css'

interface TruthProfile {
  claim: {
    id: string
    text: string
    timestamp_start: number | null
    timestamp_end: number | null
  }
  perspectives: Array<{
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
  bias_analysis: {
    framing_bias: string | null
    sourcing_bias: string | null
    omission_bias: string | null
    sensationalism: string | null
    deception_rating: number
    deception_rationale: string
  }
  overall_assessment: string
}

interface AnalysisResponse {
  video_id: string
  truth_profiles: TruthProfile[]
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

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 120000) // 120s timeout

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'
      const response = await fetch(`${apiUrl}/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
        signal: controller.signal,
      })

      if (!response.ok) {
        let errorMessage = 'Failed to analyze video'
        try {
          const errorData = await response.json()
          errorMessage = errorData.detail || errorMessage
        } catch {
          // Response is not JSON, use default message
        }
        throw new Error(errorMessage)
      }

      const data: AnalysisResponse = await response.json()
      setResults(data)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setError('Request timed out. Please try again.')
      } else {
        setError(err instanceof Error ? err.message : 'An error occurred')
      }
    } finally {
      setLoading(false)
      clearTimeout(timeoutId) // Ensure timeout is cleared in case of error
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
          <p>Analyzing video transcript... This may take a minute.</p>
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

          {results.truth_profiles.map((profile, index) => (
            <div key={profile.claim.id} className="truth-profile">
              <div className="claim-header">
                <h3>Claim {index + 1}</h3>
                <p className="claim-text">{profile.claim.text}</p>
                <div className="timestamp">
                  {formatTimestamp(profile.claim.timestamp_start, profile.claim.timestamp_end)}
                </div>
              </div>

              <div className={getAssessmentClass(profile.overall_assessment)}>
                {profile.overall_assessment}
              </div>

              <div className="perspectives-section">
                <h3>Perspective Analysis</h3>
                <div className="perspectives-grid">
                  {profile.perspectives.map((perspective, perspectiveIndex) => (
                    <div key={`${perspective.perspective}-${perspectiveIndex}`} className="perspective-card">
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
                <h3>Bias & Deception Analysis</h3>
                <div className="bias-grid">
                  {profile.bias_analysis.framing_bias && (
                    <div className="bias-item">
                      <span className="bias-label">Framing Bias:</span>
                      <span className="bias-value">{profile.bias_analysis.framing_bias}</span>
                    </div>
                  )}
                  {profile.bias_analysis.sourcing_bias && (
                    <div className="bias-item">
                      <span className="bias-label">Sourcing Bias:</span>
                      <span className="bias-value">{profile.bias_analysis.sourcing_bias}</span>
                    </div>
                  )}
                  {profile.bias_analysis.omission_bias && (
                    <div className="bias-item">
                      <span className="bias-label">Omission Bias:</span>
                      <span className="bias-value">{profile.bias_analysis.omission_bias}</span>
                    </div>
                  )}
                  {profile.bias_analysis.sensationalism && (
                    <div className="bias-item">
                      <span className="bias-label">Sensationalism:</span>
                      <span className="bias-value">{profile.bias_analysis.sensationalism}</span>
                    </div>
                  )}
                </div>

                <div className="deception-rating">
                  <div className="deception-score">
                    {profile.bias_analysis.deception_rating.toFixed(1)}/10
                  </div>
                  <div className="deception-rationale">
                    {profile.bias_analysis.deception_rationale}
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
