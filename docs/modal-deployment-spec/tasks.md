# Modal Deployment Implementation Tasks

## Track 1: Modal Infrastructure (Backend)

- [ ] **T1.1: Create Modal Configuration Script**
  - **Description**: Create `backend/modal_app.py` as the entrypoint for Modal. Import the FastAPI `app` from `app.main`.
  - **Dependencies**: None
  - **Traceability**: FR1, NFR1, NFR3

- [ ] **T1.2: Define Modal Image with Rust Toolchain**
  - **Description**: In `modal_app.py`, define a `modal.Image.debian_slim()`. Add `apt-get install` commands for `curl` and `build-essential`. Add a `run_commands` step to install `rustup`. Add a final step to `pip install -r requirements.txt`.
  - **Dependencies**: T1.1
  - **Traceability**: FR2, US2

- [ ] **T1.3: Configure Modal Secrets & Decorator**
  - **Description**: Decorate the ASGI function with `@app.function(image=image, secrets=[modal.Secret.from_name("perspective-prism-secrets")])`.
  - **Dependencies**: T1.1, T1.2
  - **Traceability**: FR3

## Track 2: Client Fallback (Chrome Extension)

> [!TIP] PARALLEL EXECUTION
> Track 2 can be developed and tested entirely in parallel with Track 1 by mocking API error responses.

- [ ] **T2.1: Update API Client Error Handling**
  - **Description**: Modify `chrome-extension/client.js` (and the `-script.js` equivalent) to detect HTTP 402, 429, 502, and 503 responses. Add a specific error code (e.g., `QUOTA_EXHAUSTED`) to the thrown Error object.
  - **Dependencies**: None
  - **Traceability**: FR4

- [ ] **T2.2: Implement Graceful Exhaustion UI**
  - **Description**: Update `chrome-extension/content.js` and `chrome-extension/popup.js` to catch the `QUOTA_EXHAUSTED` error. Render a custom HTML block informing the user about the free-tier limit and providing a hyperlink to the GitHub repository.
  - **Dependencies**: T2.1
  - **Traceability**: FR5, US3

- [ ] **T2.3: Handle Cold-Start Timeouts**
  - **Description**: Ensure the `fetch` timeout logic in `client.js` allows for at least 15-20 seconds to accommodate Modal cold starts, preventing premature timeouts before the container boots.
  - **Dependencies**: None
  - **Traceability**: NFR2

## Track 3: Documentation and Deployment

- [ ] **T3.1: Update README for Modal Deployment**
  - **Description**: Add a new section to `README.md` detailing how to set up Modal Labs, create the required Modal Secrets, and run `modal deploy modal_app.py`.
  - **Dependencies**: T1.3
  - **Traceability**: US1
