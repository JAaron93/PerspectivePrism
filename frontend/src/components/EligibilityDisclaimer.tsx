import React from 'react';
import type { ContentEligibilityResult } from '../types';

export interface EligibilityDisclaimerProps {
  eligibility: ContentEligibilityResult;
  onForceAnalyze: () => void;
  loading?: boolean;
}

export const EligibilityDisclaimer: React.FC<EligibilityDisclaimerProps> = ({
  eligibility,
  onForceAnalyze,
  loading = false,
}) => {
  const matchPercentage = Math.round((eligibility.confidence_score ?? 1.0) * 100);

  return (
    <section
      className="eligibility-disclaimer"
      role="status"
      aria-live="polite"
      aria-labelledby="disclaimer-title"
    >
      <div className="disclaimer-header">
        <span className="disclaimer-icon" aria-hidden="true">
          ⚠️
        </span>
        <h3 id="disclaimer-title" className="disclaimer-title">
          {eligibility.disclaimer_title || 'Analysis Skipped'}
        </h3>
        <span className="disclaimer-category-badge" aria-label={`Detected Category: ${eligibility.detected_category}`}>
          {eligibility.detected_category} • {matchPercentage}% Match
        </span>
      </div>

      <p className="disclaimer-message">{eligibility.disclaimer_message}</p>

      {eligibility.key_topics_found && eligibility.key_topics_found.length > 0 && (
        <div className="disclaimer-topics" aria-label="Key topics detected in video">
          <span className="topics-label">Detected Topics:</span>
          <div className="topics-list">
            {eligibility.key_topics_found.map((topic, index) => (
              <span key={`topic-${index}`} className="topic-badge">
                {topic}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="disclaimer-divider" role="separator" />

      <p className="disclaimer-tip">
        <strong>Tip:</strong> Navigate to a news broadcast, documentary, or political commentary video to run full multi-perspective analysis.
      </p>

      <div className="disclaimer-actions">
        <button
          id="pp-force-analyze-btn"
          type="button"
          className="force-analyze-btn"
          onClick={onForceAnalyze}
          disabled={loading}
          aria-label="Force analysis anyway and bypass pre-classification guardrail"
        >
          {loading ? (
            <>
              <span className="btn-spinner" aria-hidden="true" />
              <span>Analyzing Anyway...</span>
            </>
          ) : (
            <span>⚡ Analyze Anyway</span>
          )}
        </button>
      </div>
    </section>
  );
};
