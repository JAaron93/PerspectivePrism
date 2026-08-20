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
* `npm run preview`: Previews the production build bundle locally.
