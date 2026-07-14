# Modal Labs Deployment Design Specification

## 1. Overview
PerspectivePrism is currently running locally. This specification outlines the architecture and deployment strategy for migrating the FastAPI backend to Modal Labs. Modal Labs provides a serverless platform that aligns perfectly with our need for a scalable, zero-maintenance backend that leverages a free tier for portfolio demonstration.

## 2. Architecture Constraints & Modal Integration
The backend is a standard FastAPI application. Modal natively supports ASGI apps (like FastAPI) using the `@modal.asgi_app()` decorator.
- **Compute Instance**: 1 CPU core, 1 GB Memory.
- **Scaling**: Modal scales containers to 0 when there are no incoming requests. This ensures we only pay for active execution time (I/O wait time during LLM and Search API calls).
- **Environment**: Secrets (OpenAI, Google Search API) will be securely injected via Modal Secrets.

## 3. Rust Extension Compilation
A critical constraint is the `prism_sanitizer_rs` Rust extension. The Modal container image must be built from a Debian base, install standard build tools, and install the Rust toolchain (`rustup`) before executing `pip install -e .` or `pip install -r requirements.txt`.

## 4. Cost & Usage Estimates
Modal Labs provides a $30/month free tier of compute credits. Modal charges per CPU/RAM second of execution time.
- **CPU Cost**: ~$0.0000131 / core / second
- **RAM Cost**: ~$0.00000222 / GiB / second
- **Total Instance Cost**: ~$0.00001532 / second (1 CPU, 1 GB RAM)

**Usage Projections:**
- **Assume**: 1 claim analysis takes approximately 30 seconds of compute time (mostly waiting for external APIs).
- **Assume**: 1 user performs 30 claim analyses per month (1 per day).
- **User Cost**: 30 * 30s = 900 seconds. 900 * $0.00001532 = **$0.0137 per user / month.**
- **Capacity**: $30.00 / $0.0137 = **~2,189 active users per month.**

## 5. Graceful Exhaustion Mechanism
This project is primarily a portfolio project and is not intended to be a scaled commercial product. It relies on the free tier of Modal Labs, which can only support around **~2,000 monthly users**. Because I do not have the funds to scale this infrastructure, the system must handle compute exhaustion gracefully:
- When Modal credits are exhausted, the API will fail to start the container, resulting in HTTP 402, 429, 502, or 503 errors.
- The Chrome Extension (`client.js` and UI scripts) will detect these errors.
- Instead of showing a generic "Backend Unavailable" error, it will present a custom UI state: *"PerspectivePrism has reached its monthly server limit. To continue using the extension, you can easily self-host it on your own machine. [Learn how on GitHub]"*
