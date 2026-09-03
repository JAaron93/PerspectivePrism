// Ambient type declarations for Chrome Extension classic scripts and window properties

interface Performance {
  memory?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
}

interface Element {
  currentTime?: number;
  duration?: number;
  dataset?: DOMStringMap;
  disabled?: boolean;
  focus?: (options?: FocusOptions) => void;
  onclick?: any;
}

interface HTMLElement {
  disabled?: boolean;
  _keydownHandler?: any;
}

interface Error {
  fatal?: boolean;
}

interface Window {
  Logger?: any;
  logger?: any;
  showState?: any;
  ppPrintMetrics?: any;
  ppAnalysisData?: any;
  ppMemoryMonitor?: any;
  ppMemoryStats?: any;
  ppMemoryMeasure?: any;
  ppMemoryDebug?: any;
  clusterClaims?: any;
  renderTimelineMarkers?: any;
  parseTimestampToSeconds?: any;
  extractVideoIdFromUrl?: any;
  isValidVideoId?: any;
  extractVideoId?: any;
  ConfigManager?: any;
  ConsentManager?: any;
  ClaimNavigator?: any;
  ConfigValidator?: any;
  QuotaManager?: any;
  MetricsTracker?: any;
  DEFAULT_CONFIG?: any;
  renderOptimisticSkeletons?: any;
  checkCurrentTabState?: any;
  renderIneligibleDisclaimer?: any;
  startAnalysis?: any;
  DOMPurify?: any;
  PerspectivePrismClient?: any;
  ValidationError?: any;
  HttpError?: any;
  TimeoutError?: any;
}

type TruthTheoryType =
  | "Correspondence (Empirical)"
  | "Coherence (Systemic Narrative)"
  | "Pragmatic (Practical Utility)"
  | "Perspectivism (Lived Experience)"
  | "Consensus (Institutional Agreement)"
  | "Deflationary (Rhetorical Endorsement)";

interface VideoMetadata {
  title: string;
  channel_name: string;
  category_id?: string;
  category_name?: string;
  tags?: string[];
  description_snippet?: string;
}

interface ContentEligibilityResult {
  is_analysable: boolean;
  confidence_score: number;
  detected_category: string;
  disclaimer_title: string;
  disclaimer_message: string;
  key_topics_found: string[];
}

interface AlethiologyAnalysis {
  primary_theory: TruthTheoryType;
  secondary_theory?: TruthTheoryType | null;
  epistemic_summary: string;
  quote_evidences: string[];
}

interface ClientTruthProfile {
  overall_assessment: string;
  perspectives: Record<string, any>;
  bias_indicators: any;
  alethiology?: AlethiologyAnalysis;
}

declare var PerspectivePrismClient: any;
declare var ValidationError: any;
declare var HttpError: any;
declare var TimeoutError: any;
declare var startAnalysis: any;
declare var renderIneligibleDisclaimer: any;

declare var QuotaManager: any;
declare var MetricsTracker: any;
declare var ConfigManager: any;
declare var ConsentManager: any;
declare var ClaimNavigator: any;
declare var ConfigValidator: any;
declare var DEFAULT_CONFIG: any;
declare var createPanelContainer: any;
declare var extractVideoIdFromUrl: any;
declare var isValidVideoId: any;
declare var extractVideoId: any;
declare var Logger: any;
declare var logger: any;
declare var parseTimestampToSeconds: any;
declare var clusterClaims: any;
declare var renderTimelineMarkers: any;
declare var DOMPurify: any;
declare var renderOptimisticSkeletons: any;
declare var checkCurrentTabState: any;

declare module "./vendor/dompurify.js" {
  const DOMPurify: any;
  export default DOMPurify;
}

declare module "dompurify" {
  const DOMPurify: any;
  export default DOMPurify;
}
