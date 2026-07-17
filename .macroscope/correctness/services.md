---
include:
  - "backend/app/services/**/*"
---

Service layer — business logic only, no route handling here. Each service
is a class (ClaimExtractor, EvidenceRetriever, AnalysisService). Review for:
- Correct async/await usage and proper concurrent task management
- LLM prompt quality and robustness (malformed responses, unexpected output)
- Evidence retrieval covering all four perspectives consistently
- Circuit breaker logic in AnalysisService (cb_open, cb_failures, backup_client)
