---
include:
  - "backend/app/utils/input_sanitizer.py"
---

This is the critical security boundary for LLM prompt injection prevention.
Review carefully for:
- Bypass vectors or incomplete sanitization patterns
- Edge cases with Unicode, special characters, or encoding tricks
- Any weakening of existing sanitization rules
