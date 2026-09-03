# Frontend Invariants & Development Rules

This document defines the implementation guidelines, compiler architecture, and coding conventions for the React Single Page Application (`frontend/`).

---

## 1. Tooling & Compiler Architecture (ADR 004)

* **TypeScript 7.0 Native Engine**:
  - The build system (`npm run build`) uses TypeScript 7.0 for sub-second Go-native compilation (`tsc -b && vite build` < 1.0s).
  - Delivers native multithreaded type checking and instant build feedback.
* **ESLint Bridge (`@typescript/typescript6`)**:
  - Because TypeScript 7.0 does not yet ship with a stable programmatic compiler API (targeted for TS 7.1), `package.json` installs Microsoft's `@typescript/typescript6` compatibility package to provide the AST parser for `typescript-eslint`.
  - `tsc` is linked to the native TS 7.0 binary (`typescript-7: npm:typescript@^7.0.2`).
  - Do NOT remove or flag `@typescript/typescript6` as redundant.

---

## 2. Coding Conventions

* **Functional Components & Hooks**:
  - Use functional components with hooks only; no class components.
* **Strict TypeScript Typing**:
  - TypeScript interfaces for all API response and component prop types.
  - Strictly avoid `any`.
* **CSS & Layout**:
  - Plain, responsive custom CSS without external utility libraries (no Tailwind, CSS-in-JS, or Bootstrap).
* **Environment Variables**:
  - All frontend environment variables MUST be prefixed with `VITE_`.
* **Error Handling & State**:
  - Handle asynchronous states with try/catch, clear loading indicators, and user-friendly error banners.

---

## 3. Common Development Commands

* `npm run dev`: Starts local Vite dev server on port 5173.
* `npm run build`: Sub-second production compilation (`tsc -b && vite build`).
* `npm run lint`: Runs ESLint across TypeScript and TSX source files.
* `npm test`: Runs fast component unit tests via `node --test` and esbuild.
* `npm run preview`: Previews the production build bundle locally.

---

## 4. Pre-Classification & Epistemic Lens SPA Invariants

* **Unconditional State Reset on Submission**:
  - On every new analysis submission (`handleSubmit` / `startAnalysis`), the frontend MUST immediately reset all previous results (`setResults(null)`), active errors (`setError(null)`), and streaming states. Stale video IDs or disclaimers must never leak into subsequent analysis runs.
* **Force-Override Target Pinning (CRITICAL)**:
  - When rendering the `#pp-force-analyze-btn` ("⚡ Analyze Anyway") on an ineligible disclaimer, the override handler MUST pin its target to the immutable `analyzedUrl` that generated the disclaimer, NOT the mutable input field state (`url`). This prevents a user who edited the input field from accidentally bypassing pre-classification on a completely different video.
* **Epistemic Lens Component Guardrails**:
  - Must visually classify truth frameworks across the 6 canonical theories (`Correspondence`, `Coherence`, `Pragmatic`, `Perspectivism`, `Consensus`, `Deflationary`) using distinct CSS color tokens.
  - Epistemic summaries must remain strictly descriptive with no normative judgments or bias accusations.
  - Transcript quote drawers must use accessible collapsible controls (`aria-expanded`, `aria-controls`).

---

## 5. Testing Architecture & TypeScript Isolation

* **Fast Node Native Unit Testing**:
  - React component markup and contract tests run via `node --test` bundled with `esbuild` and rendered via `react-dom/server` (`renderToStaticMarkup`) for sub-second feedback (<300ms) without heavy test framework overhead.
* **Browser vs. Node Compiler Scope Separation**:
  - `tsconfig.app.json` is reserved exclusively for browser client types (`"types": ["vite/client"]`).
  - Unit test files containing Node imports (`node:test`, `node:assert/strict`) MUST be explicitly excluded in `tsconfig.app.json` via `"exclude": ["src/**/__tests__/*"]` to ensure `npm run build` (`tsc -b && vite build`) compiles with zero Node type leakage.

