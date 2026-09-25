"""Modal Labs deployment entrypoint for Perspective Prism.

Defines the serverless container image, secret bindings, single-container routing,
and ASGI application mount connecting to Google Cloud Platform Vertex AI.
"""

import os
import stat
from pathlib import Path
import modal

BACKEND_DIR = Path(__file__).resolve().parent
SA_CREDENTIALS_PATH = Path("/tmp/gcp_sa.json")

app = modal.App("perspective-prism-backend")

# Container Image Definition (FR2, US2)
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("curl", "build-essential", "pkg-config", "gcc")
    .run_commands(
        "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y",
    )
    .add_local_dir(str(BACKEND_DIR / "prism_sanitizer_rs"), "/root/prism_sanitizer_rs", copy=True)
    .run_commands(
        'PATH="/root/.cargo/bin:$PATH" pip install -e /root/prism_sanitizer_rs',
    )
    .add_local_file(str(BACKEND_DIR / "requirements.txt"), "/root/requirements.txt", copy=True)
    .run_commands(
        "grep -v 'prism_sanitizer_rs' /root/requirements.txt > /root/requirements_clean.txt",
        "pip install -r /root/requirements_clean.txt",
    )
    .add_local_dir(str(BACKEND_DIR / "app"), "/root/app", copy=True)
)


def _bootstrap_gcp_credentials(target_path: Path | None = None) -> str | None:
    """Bootstraps Google Application Default Credentials from Modal Secrets.

    If GCP_SERVICE_ACCOUNT_JSON is present in the environment, writes it to
    the credentials path with restrictive permissions (0600) and exports
    GOOGLE_APPLICATION_CREDENTIALS.
    """
    sa_json = os.environ.get("GCP_SERVICE_ACCOUNT_JSON")
    if not sa_json or not sa_json.strip():
        return None

    dest_file = target_path or SA_CREDENTIALS_PATH
    dest_file.parent.mkdir(parents=True, exist_ok=True)
    dest_file.write_text(sa_json.strip(), encoding="utf-8")
    dest_file.chmod(stat.S_IRUSR | stat.S_IWUSR)  # 0o600

    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(dest_file)
    return str(dest_file)


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("perspective-prism-gcp-secrets")],
    max_containers=1,
    scaledown_window=120,
)
@modal.concurrent(max_inputs=10)
@modal.asgi_app()
def fastapi_app():
    """ASGI application factory initializing credentials and mounting FastAPI."""
    _bootstrap_gcp_credentials()
    from app.main import app as fastapi_application
    return fastapi_application
