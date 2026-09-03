export type TruthTheoryType =
  | "Correspondence (Empirical)"
  | "Coherence (Systemic Narrative)"
  | "Pragmatic (Practical Utility)"
  | "Perspectivism (Lived Experience)"
  | "Consensus (Institutional Agreement)"
  | "Deflationary (Rhetorical Endorsement)";

export interface VideoMetadata {
  title: string;
  channel_name: string;
  category_id?: string;
  category_name?: string;
  tags?: string[];
  description_snippet?: string;
}

export interface VideoRequest {
  url: string;
  force_override?: boolean;
  metadata?: VideoMetadata;
}

export interface ContentEligibilityResult {
  is_analysable: boolean;
  confidence_score: number;
  detected_category: string;
  disclaimer_title: string;
  disclaimer_message: string;
  key_topics_found: string[];
}

export interface AlethiologyAnalysis {
  primary_theory: TruthTheoryType;
  secondary_theory?: TruthTheoryType | null;
  epistemic_summary: string;
  quote_evidences: string[];
}

export interface Evidence {
  url: string;
  title: string;
  snippet: string;
  source: string;
}

export interface PerspectiveAnalysis {
  perspective: string;
  stance: string;
  confidence: number;
  explanation: string;
  evidence: Evidence[];
}

export interface BiasIndicators {
  logical_fallacies: string[];
  emotional_manipulation: string[];
  deception_score: number | null;
}

export interface ClientTruthProfile {
  overall_assessment: string;
  perspectives: Record<string, PerspectiveAnalysis>;
  bias_indicators: BiasIndicators;
  alethiology?: AlethiologyAnalysis | null;
}

export interface ClientClaimAnalysis {
  claim_text: string;
  video_timestamp_start: number | null;
  video_timestamp_end: number | null;
  truth_profile: ClientTruthProfile;
}

export interface AnalysisMetadata {
  analyzed_at: string;
}

export interface AnalysisResponse {
  video_id: string;
  metadata: AnalysisMetadata;
  eligibility?: ContentEligibilityResult | null;
  claims: ClientClaimAnalysis[];
}

export interface JobResponse {
  job_id: string;
}

export interface JobStatusResponse {
  job_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  result?: AnalysisResponse | null;
  error?: string | null;
}
