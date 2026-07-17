export default [
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        window: "readonly",
        document: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        fetch: "readonly",
        AbortController: "readonly",
        HTMLElement: "readonly",
        MutationObserver: "readonly",
        history: "readonly",
        location: "readonly",
        CustomEvent: "readonly",
        chrome: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        alert: "readonly",
        confirm: "readonly",
        performance: "readonly",
        gc: "readonly",
        localStorage: "readonly",
        requestAnimationFrame: "readonly",
        module: "readonly",
        
        // Custom extension globals shared across scripts
        QuotaManager: "readonly",
        MetricsTracker: "readonly",
        ConfigManager: "readonly",
        ConsentManager: "readonly",
        ClaimNavigator: "readonly",
        ConfigValidator: "readonly",
        DEFAULT_CONFIG: "readonly",
        createPanelContainer: "readonly",
        extractVideoIdFromUrl: "readonly",
        isValidVideoId: "readonly"
      }
    },
    rules: {
      "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
      "no-undef": "error"
    }
  },
  {
    ignores: [
      "dist/**/*",
      "node_modules/**/*",
      "coverage/**/*",
      "tests/**/*",
      "build.js",
      "scripts/**/*"
    ]
  }
];
