---
include:
  - "frontend/**/*"
---

React 19 + TypeScript + Vite SPA. Key context:
- This is a single-page application. Do not suggest routing libraries,
  state management frameworks (Redux, Zustand), or component libraries.
- CSS is custom — do not suggest Tailwind, CSS-in-JS, or UI component
  libraries.
- The frontend polls the backend job API for incremental analysis results.
  Review polling logic for correctness and UX (loading states, error states).
- Environment variables use the VITE_ prefix.
- TypeScript interfaces should cover all API response shapes. Flag any
  use of `any` on API response types.
