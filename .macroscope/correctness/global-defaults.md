---
include:
  - "**/*"
---

This is a personal portfolio project built by a single developer. It is not
an enterprise product. Do not suggest:
- Role-based access control, multi-tenancy, or team permission systems
- Message queues, distributed tracing, or microservice decomposition
- Dedicated logging infrastructure (Datadog, Sentry, ELK, etc.)
- Database migrations, ORMs, or persistence layers (the job store is intentionally in-memory for MVP)
- CI/CD pipeline configuration or deployment automation
- Docker, container orchestration, or cloud infrastructure
- API versioning, rate limiting tiers, or SLA guarantees

DO focus on:
- Correctness and logic bugs
- Security issues specific to LLM integration (prompt injection, input sanitization gaps)
- Clear, readable code that a solo developer can maintain
- Performance issues that would noticeably degrade the user experience
- Missing error handling that could cause silent failures
- Test coverage gaps for critical paths
