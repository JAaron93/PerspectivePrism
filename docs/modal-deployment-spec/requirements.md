# Modal Deployment Requirements

## Functional Requirements (FR)

- **FR1 - Modal ASGI App**: The system MUST define a `modal.App` and expose the FastAPI application via the `@modal.asgi_app` decorator.
- **FR2 - Container Image Build**: The system MUST define a Modal Image that installs system dependencies (`curl`, `build-essential`), installs the Rust toolchain, and compiles the `prism_sanitizer_rs` package.
- **FR3 - Secret Management**: The deployment MUST utilize Modal Secrets to securely inject `.env` values (e.g., Gemini API keys, Google Search keys).
- **FR4 - Graceful Degradation UI**: The Chrome Extension MUST intercept specific HTTP status codes (402, 429, 502, 503) resulting from Modal compute exhaustion.
- **FR5 - Self-Hosting CTA**: Upon intercepting an exhaustion error, the Chrome Extension MUST display a user-friendly message with a hyperlink to the project's GitHub repository, explaining how to run the backend locally.

## Non-Functional Requirements (NFR)

- **NFR1 - Cost Efficiency**: The backend MUST scale to zero instances when idle to preserve the $30/month free tier credits.
- **NFR2 - Cold Start Tolerance**: The Chrome Extension UI MUST gracefully handle potential cold start delays (5-10 seconds) when the Modal container spins up from zero, without timing out prematurely.
- **NFR3 - Maintainability**: The Modal deployment configuration MUST be self-contained in a single script (e.g., `modal_app.py`) without heavily modifying the existing `main.py` entrypoint.

## User Stories

- **US1**: As a developer, I want a single command (`modal deploy`) to package and deploy the backend to Modal Labs so that I don't have to manage servers.
- **US2**: As a developer, I want the container build process to automatically compile my Rust sanitization extension so that the deployment is fully reproducible.
- **US3**: As an end-user, if the project runs out of server funds, I want to be informed of exactly why it stopped working and given clear instructions on how I can run it myself, rather than seeing a confusing error.
