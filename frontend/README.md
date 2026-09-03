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
├── eslint.config.js     # Flat ESLint configuration
├── tsconfig.json        # Solution-level TypeScript project configuration
├── tsconfig.app.json    # Application TypeScript compiler options
├── tsconfig.node.json   # Vite/Node TypeScript configuration
└── package.json         # Dependencies and scripts
```
