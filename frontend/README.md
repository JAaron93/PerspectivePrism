# Perspective Prism — Frontend

The web application for Perspective Prism, built with **React 19**, **TypeScript 7.0**, and **Vite**.

---

## 🚀 Architectural Overview (ADR 004)

* **TypeScript 7.0 Go Engine**: The application is compiled using the native Go-based TypeScript 7.0 compiler (`tsc` `7.0.2`), delivering sub-second build times (`<1.0s` for production builds) and native multithreaded type checking.
* **Side-by-Side ESLint Compatibility**: Because TypeScript 7.0 does not yet ship with a stable programmatic compiler API (targeted for TS 7.1), `package.json` installs Microsoft's `@typescript/typescript6` compatibility package to provide the AST parser for `typescript-eslint`, while `tsc` uses the native TS 7.0 binary.
* **Custom CSS**: Maintains plain, responsive custom styling without external CSS-in-JS or utility frameworks (like Tailwind).

---

## 🛠️ Development & Build Commands

### Setup
```bash
npm install
cp .env.example .env
```

### Run Local Development Server
```bash
npm run dev
```
The application starts at `http://localhost:5173`.

### Production Build
```bash
npm run build
```
Executes `tsc -b && vite build`. Production bundles are emitted to `dist/`.

### Testing
```bash
npm test
```
Executes component unit tests (`components.test.tsx`) asserting disclaimer rendering, force-override actions, and epistemic lens quote expansion.

### Gherkin BDD Acceptance Scenarios
```bash
npx playwright install chromium   # first run / after version bumps — browsers are NOT installed by npm install
npx bddgen && npx playwright test
```
Runs executable Gherkin scenarios (`tests/features/`, step definitions in `tests/steps/`) via `playwright-bdd` on the Playwright runner. **`npx bddgen` is a required pre-step before every run** — `playwright test` does not generate specs from `.feature` files, and edited features keep running as stale specs until regeneration. Playwright boots the Vite dev server automatically (`webServer`), and all backend traffic is mocked via `page.route`, so scenarios run fully offline. Convention details: `.agents/rules/frontend_invariants.md` §6.

### Linting
```bash
npm run lint
```
Runs ESLint across all TypeScript and TSX source files.

### Preview Production Build
```bash
npm run preview
```

---

## 📁 Directory Structure

```
frontend/
├── public/              # Static assets
├── src/
│   ├── assets/          # SVG and icon assets
│   ├── components/      # React UI components
│   │   ├── EligibilityDisclaimer.tsx  # Guardrail disclaimer & [⚡ Analyze Anyway]
│   │   ├── EpistemicLensCard.tsx      # Epistemic truth theories & quote accordion
│   │   ├── ThinkingComponent.tsx      # Loading & processing stream status
│   │   └── __tests__/                 # Component unit tests
│   ├── types/           # Shared TypeScript interfaces (Alethiology, Eligibility, etc.)
│   ├── utils/           # Utility functions (time formatting, etc.)
│   ├── App.tsx          # Main application component
│   ├── App.css          # Application layout styles
│   ├── index.css        # Global CSS variables and resets
│   └── main.tsx         # Application entry point
├── tests/
│   ├── features/        # Gherkin BDD feature files (per-domain)
│   └── steps/           # playwright-bdd step definitions
├── eslint.config.js     # Flat ESLint configuration
├── playwright.config.ts # BDD features/steps wiring + Vite webServer + chromium
├── tsconfig.json        # Solution-level TypeScript project configuration
├── tsconfig.app.json    # Application TypeScript compiler options
├── tsconfig.node.json   # Vite/Node TypeScript configuration (incl. BDD steps)
└── package.json         # Dependencies and scripts
```

> Generated BDD specs (`.features-gen/`) and Playwright run artifacts (`test-results/`, `playwright-report/`) are gitignored build artifacts — never edit or commit them.
