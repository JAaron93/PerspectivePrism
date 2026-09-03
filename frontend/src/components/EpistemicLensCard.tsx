import React, { useState } from 'react';
import type { AlethiologyAnalysis } from '../types';
import { ThinkingComponent } from './ThinkingComponent';
import { getTheoryColorClass } from '../utils/alethiology';

export interface EpistemicLensCardProps {
  alethiology?: AlethiologyAnalysis | null;
  isStreaming?: boolean;
}

export const EpistemicLensCard: React.FC<EpistemicLensCardProps> = ({
  alethiology,
  isStreaming = false,
}) => {
  const [isQuotesOpen, setIsQuotesOpen] = useState(false);

  if (!alethiology) {
    if (isStreaming) {
      return (
        <div className="epistemic-lens-card epistemic-lens-loading">
          <div className="epistemic-lens-header">
            <span className="epistemic-lens-title">🔭 Epistemic Lens</span>
          </div>
          <ThinkingComponent context="Analyzing epistemological framework..." />
        </div>
      );
    }
    return null;
  }

  const primaryClass = getTheoryColorClass(alethiology.primary_theory);
  const secondaryClass = alethiology.secondary_theory
    ? getTheoryColorClass(alethiology.secondary_theory)
    : '';
  const quotesCount = alethiology.quote_evidences ? alethiology.quote_evidences.length : 0;

  return (
    <div className="epistemic-lens-card" aria-label="Epistemic Lens Analysis">
      <div className="epistemic-lens-header">
        <div className="epistemic-title-group">
          <span className="epistemic-lens-title">🔭 Epistemic Lens</span>
          <span className="epistemic-lens-subtitle">Truth Framework</span>
        </div>
        <div className="epistemic-chips">
          <span
            className={`theory-chip primary-theory ${primaryClass}`}
            title={`Primary Epistemological Theory: ${alethiology.primary_theory}`}
          >
            {alethiology.primary_theory}
          </span>
          {alethiology.secondary_theory && (
            <span
              className={`theory-chip secondary-theory ${secondaryClass}`}
              title={`Supporting Theory: ${alethiology.secondary_theory}`}
            >
              Supporting: {alethiology.secondary_theory}
            </span>
          )}
        </div>
      </div>

      <p className="epistemic-summary">{alethiology.epistemic_summary}</p>

      {quotesCount > 0 && (
        <div className="epistemic-quotes-section">
          <button
            type="button"
            className="quote-accordion-toggle"
            onClick={() => setIsQuotesOpen((prev) => !prev)}
            aria-expanded={isQuotesOpen}
            aria-controls="quote-evidences-drawer"
          >
            <span className="accordion-arrow" aria-hidden="true">
              {isQuotesOpen ? '▼' : '▶'}
            </span>
            <span>Transcript Quote Evidence ({quotesCount})</span>
          </button>

          <div
            id="quote-evidences-drawer"
            className="quote-evidences-drawer"
            hidden={!isQuotesOpen}
          >
            {alethiology.quote_evidences.map((quote, idx) => (
              <blockquote key={`quote-${idx}`} className="epistemic-quote">
                "{quote}"
              </blockquote>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
