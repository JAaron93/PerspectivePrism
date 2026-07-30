#!/usr/bin/env python3
"""
GCP Vertex AI & Environment Diagnostic Verifier.

Audits environment configuration, Application Default Credentials (ADC),
GCP billing project linkage, and Gemini model connectivity in 100% GCP Vertex AI mode.
"""

import os
import sys
from pathlib import Path


def _load_env_file() -> None:
    """Loads backend/.env or .env file into os.environ if keys are not already set."""
    root_dir = Path(__file__).resolve().parent
    env_paths = [root_dir / "backend" / ".env", root_dir / ".env"]
    for env_path in env_paths:
        if env_path.is_file():
            try:
                with open(env_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line or line.startswith("#") or "=" not in line:
                            continue
                        k, v = line.split("=", 1)
                        k = k.strip()
                        v = v.strip().strip("'\"")
                        if k and k not in os.environ:
                            os.environ[k] = v
            except Exception:
                pass
            break


def verify_environment() -> bool:
    print("🔍 Auditing Perspective Prism Environment Configuration...\n")
    
    _load_env_file()

    # 1. Environment Variable Precedence Check (GCP_PROJECT takes precedence over GOOGLE_CLOUD_PROJECT)
    gcp_project = (os.getenv("GCP_PROJECT") or os.getenv("GOOGLE_CLOUD_PROJECT") or "").strip()
    gcp_location = (os.getenv("GCP_LOCATION") or os.getenv("GOOGLE_CLOUD_REGION") or "global").strip() or "global"
    gemini_tier = os.getenv("GEMINI_TIER", "paid").strip()

    if not gcp_project:
        print("❌ FAILED: Missing GCP_PROJECT or GOOGLE_CLOUD_PROJECT environment variable.")
        print("   Google AI Studio Key Mode has been permanently removed; this project exclusively uses GCP Vertex AI Mode (Paid Tier).")
        print("   Please configure GCP_PROJECT in backend/.env or export GCP_PROJECT in your environment.")
        print("   Example: GCP_PROJECT=my-gcp-project-id GCP_LOCATION=global GEMINI_TIER=paid")
        return False

    print(f"✅ Active Provider Mode: GCP Vertex AI Mode (Paid Tier Credits)")
    print(f"   • GCP Project ID: {gcp_project}")
    print(f"   • GCP Region/Location: {gcp_location}")
    print(f"   • Gemini Tier: {gemini_tier}")

    # 2. Dependency & SDK Inspection
    try:
        from google import genai
        from google.genai import types
        print("✅ Google GenAI SDK (google-genai>=2.9.0) loaded successfully.")
    except ImportError as e:
        print(f"❌ FAILED: Unable to import 'google-genai' SDK: {e}")
        return False

    # 3. Client Instantiation & Connectivity Audit
    print("\n📡 Testing Provider Connectivity & Model Inference...")
    try:
        client = genai.Client(vertexai=True, project=gcp_project, location=gcp_location)

        model_name = os.getenv("LLM_MODEL", "gemini-3.5-flash-lite")
        response = client.models.generate_content(
            model=model_name,
            contents="Respond with 'VERIFIED_OK' if connectivity is operational.",
            config=types.GenerateContentConfig(max_output_tokens=10),
        )

        response_text = (response.text or "").strip()
        print(f"✅ Inference Successful!")
        print(f"   • Target Model: {model_name}")
        print(f"   • Model Output: '{response_text}'")
        print("\n🎉 Environment configuration verified cleanly!")
        return True

    except Exception as e:
        print(f"❌ FAILED: Provider connectivity check failed: {e}")
        print("\nCommon Troubleshooting Steps:")
        print("  1. Run 'gcloud auth application-default login' to set up local ADC credentials.")
        print("  2. Verify billing is enabled: 'gcloud beta billing projects describe <PROJECT_ID>'.")
        print("  3. Enable Vertex AI API: 'gcloud services enable aiplatform.googleapis.com'.")
        return False

if __name__ == "__main__":
    success = verify_environment()
    sys.exit(0 if success else 1)
