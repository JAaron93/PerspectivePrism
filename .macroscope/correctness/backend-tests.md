---
include:
  - "backend/tests/**/*"
---

pytest + pytest-asyncio test suite. Review for:
- Tests that actually assert meaningful behavior, not just that code runs
- Async test correctness (proper use of pytest-asyncio fixtures)
- Missing coverage for sanitization edge cases and LLM failure paths
- Do not suggest test infrastructure like factories, fixtures frameworks,
  or test databases — keep it simple.
