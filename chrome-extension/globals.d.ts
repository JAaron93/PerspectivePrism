// Ambient type declarations for Chrome Extension classic scripts and window properties

interface Performance {
  memory?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
}

interface Window {
  Logger?: any;
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
}

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
