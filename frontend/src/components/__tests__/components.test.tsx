import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';

import { EligibilityDisclaimer } from '../EligibilityDisclaimer';
import { EpistemicLensCard } from '../EpistemicLensCard';
import type {
  ContentEligibilityResult,
  AlethiologyAnalysis,
  TruthTheoryType,
  VideoRequest,
  VideoMetadata,
} from '../../types';

test('T6.1: TypeScript types contract and instantiation', () => {
  const meta: VideoMetadata = {
    title: 'Test Video',
    channel_name: 'Test Channel',
    category_id: '10',
    category_name: 'Music',
    tags: ['music', 'test'],
    description_snippet: 'Test description snippet',
  };

  const req: VideoRequest = {
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    force_override: false,
    metadata: meta,
  };
  assert.equal(req.force_override, false);
  assert.equal(req.metadata?.category_name, 'Music');

  const truthTheory: TruthTheoryType = 'Correspondence (Empirical)';
  assert.equal(truthTheory, 'Correspondence (Empirical)');
});

test('T6.2: EligibilityDisclaimer renders disclaimer state with all required elements', () => {
  const eligibility: ContentEligibilityResult = {
    is_analysable: false,
    confidence_score: 0.96,
    detected_category: 'Anime Music Video (AMV)',
    disclaimer_title: 'Analysis Skipped',
    disclaimer_message: 'This video appears to be a music video/AMV and does not contain political discourse.',
    key_topics_found: ['Anime', 'Music'],
  };

  let forceAnalyzeCalled = false;
  const onForceAnalyze = () => {
    forceAnalyzeCalled = true;
  };

  const html = renderToStaticMarkup(
    <EligibilityDisclaimer
      eligibility={eligibility}
      onForceAnalyze={onForceAnalyze}
      loading={false}
    />
  );

  onForceAnalyze();
  assert.equal(forceAnalyzeCalled, true);

  // Assert required elements per FR12
  assert.match(html, /Analysis Skipped/);
  assert.match(html, /Anime Music Video \(AMV\)/);
  assert.match(html, /96% Match/);
  assert.match(html, /This video appears to be a music video\/AMV/);
  assert.match(html, /Tip:/);
  assert.match(html, /id="pp-force-analyze-btn"/);
  assert.match(html, /Analyze Anyway/);
  assert.match(html, /Anime/);
  assert.match(html, /Music/);
});

test('T6.2: EligibilityDisclaimer button shows loading state when active', () => {
  const eligibility: ContentEligibilityResult = {
    is_analysable: false,
    confidence_score: 1.0,
    detected_category: 'Gaming Speedrun',
    disclaimer_title: 'No Political Content Found',
    disclaimer_message: 'Video contains no political or policy debate.',
    key_topics_found: [],
  };

  const html = renderToStaticMarkup(
    <EligibilityDisclaimer
      eligibility={eligibility}
      onForceAnalyze={() => {}}
      loading={true}
    />
  );

  assert.match(html, /disabled=""/);
  assert.match(html, /Analyzing Anyway\.\.\./);
});

test('T6.2: EpistemicLensCard renders primary theory, secondary theory, summary, and quotes', () => {
  const alethiology: AlethiologyAnalysis = {
    primary_theory: 'Correspondence (Empirical)',
    secondary_theory: 'Consensus (Institutional Agreement)',
    epistemic_summary: 'The speaker substantiates claims through empirical measurement and peer-reviewed studies.',
    quote_evidences: [
      'Raman spectroscopy confirmed microplastic concentration in brain tissue.',
      'Over 200 lead authors verified the dataset across three clinical trials.',
    ],
  };

  const html = renderToStaticMarkup(
    <EpistemicLensCard alethiology={alethiology} />
  );

  // Assert required elements per FR14
  assert.match(html, /Epistemic Lens/);
  assert.match(html, /Correspondence \(Empirical\)/);
  assert.match(html, /Consensus \(Institutional Agreement\)/);
  assert.match(html, /empirical measurement and peer-reviewed studies/);
  assert.match(html, /Transcript Quote Evidence/);
  assert.match(html, /Raman spectroscopy confirmed microplastic concentration/);
  assert.match(html, /Over 200 lead authors verified/);
});

test('T6.2: EpistemicLensCard returns null or thinking state when alethiology is absent', () => {
  const htmlNull = renderToStaticMarkup(
    <EpistemicLensCard alethiology={null} isStreaming={false} />
  );
  assert.equal(htmlNull, '');

  const htmlStreaming = renderToStaticMarkup(
    <EpistemicLensCard alethiology={null} isStreaming={true} />
  );
  assert.match(htmlStreaming, /Analyzing epistemological framework\.\.\./);
});
