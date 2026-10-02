"""Client for the local Ollama text-generation API."""

from __future__ import annotations

import os
import shutil
import subprocess
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit, urlunsplit

import requests


OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434/api/generate")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2")
OLLAMA_AUTO_START = os.getenv("OLLAMA_AUTO_START", "1").lower() not in {
    "0",
    "false",
    "no",
    "off",
}
try:
    OLLAMA_STARTUP_TIMEOUT = float(os.getenv("OLLAMA_STARTUP_TIMEOUT", "15"))
except ValueError:
    OLLAMA_STARTUP_TIMEOUT = 15.0
try:
    OLLAMA_TIMEOUT = float(os.getenv("OLLAMA_TIMEOUT", "90"))
except ValueError:
    OLLAMA_TIMEOUT = 90.0


class AIServiceError(RuntimeError):
    """An error that can be safely returned from an API endpoint."""

    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


SYSTEM_PROMPTS = {
    "summarize": (
        "You are an AI assistant built into a sticky notes app. Summarize the "
        "following note into 1-2 concise bullet points or short sentences. "
        "Output ONLY the summary without meta-talk or introductory text."
    ),
    "fix_spelling": (
        "Correct all spelling, grammar, and punctuation errors in the text "
        "provided below. Keep the meaning and tone identical. Output ONLY the "
        "corrected text without explanations."
    ),
    "expand": (
        "Elaborate on the note ideas provided below, turning brief keywords into "
        "clear, actionable bullet points. Output ONLY the expanded text."
    ),
}


def _ollama_tags_url() -> str:
    """Build the health endpoint from the configured generate endpoint."""

    parsed = urlsplit(OLLAMA_URL)
    return urlunsplit((parsed.scheme, parsed.netloc, "/api/tags", "", ""))


def ollama_is_running() -> bool:
    """Return True when Ollama responds to its local model-list endpoint."""

    try:
        response = requests.get(_ollama_tags_url(), timeout=1.5)
    except requests.RequestException:
        return False
    return response.ok


def _find_ollama_executable() -> str | None:
    """Find Ollama on PATH or in its common Windows install locations."""

    executable = shutil.which("ollama") or shutil.which("ollama.exe")
    if executable:
        return executable

    if os.name != "nt":
        return None

    candidates: list[Path] = []
    local_app_data = os.getenv("LOCALAPPDATA")
    program_files = os.getenv("PROGRAMFILES")
    program_files_x86 = os.getenv("PROGRAMFILES(X86)")
    for base in (local_app_data, program_files, program_files_x86):
        if base:
            install_dir = Path(base) / "Ollama"
            candidates.extend((install_dir / "ollama.exe", install_dir / "Ollama.exe"))

    for candidate in candidates:
        if candidate.is_file():
            return str(candidate)
    return None


def ensure_ollama_running() -> None:
    """Start Ollama when possible and wait briefly for its API to come online."""

    if ollama_is_running():
        return
    if not OLLAMA_AUTO_START:
        raise AIServiceError(
            "Ollama is not running. Set OLLAMA_AUTO_START=1 or start Ollama manually."
        )

    executable = _find_ollama_executable()
    if executable is None:
        raise AIServiceError(
            "Ollama is not installed or is not available on PATH. Install Ollama, "
            "then restart this server."
        )

    creation_flags = getattr(subprocess, "CREATE_NO_WINDOW", 0) if os.name == "nt" else 0
    start_new_session = os.name != "nt"
    try:
        subprocess.Popen(
            [executable, "serve"],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=creation_flags,
            start_new_session=start_new_session,
        )
    except OSError as exc:
        raise AIServiceError(
            "Ollama was found but could not be started automatically. "
            "Run 'ollama serve' manually."
        ) from exc

    deadline = time.monotonic() + max(0.5, OLLAMA_STARTUP_TIMEOUT)
    while time.monotonic() < deadline:
        if ollama_is_running():
            return
        time.sleep(0.25)

    raise AIServiceError(
        "Ollama was found but did not become ready in time. "
        "Run 'ollama serve' manually and try again."
    )


def _build_request(
    action: str, content: str, custom_prompt: str | None
) -> tuple[str, str]:
    if action in SYSTEM_PROMPTS:
        return SYSTEM_PROMPTS[action], content

    if action == "custom" and custom_prompt:
        system = (
            "Apply the following request to the provided note content. "
            f"Request: {custom_prompt.strip()} Output ONLY the resulting modified text."
        )
        return system, content

    raise AIServiceError("Unsupported AI action.", status_code=400)


def generate_ai_result(
    *, action: str, content: str, custom_prompt: str | None = None
) -> str:
    """Send one complete generation request to Ollama and return its text."""

    ensure_ollama_running()
    system_prompt, note_content = _build_request(action, content, custom_prompt)
    payload: dict[str, Any] = {
        "model": OLLAMA_MODEL,
        "system": system_prompt,
        "prompt": note_content,
        "stream": False,
        "options": {"temperature": 0.2},
    }

    try:
        response = requests.post(OLLAMA_URL, json=payload, timeout=OLLAMA_TIMEOUT)
    except requests.RequestException as exc:
        raise AIServiceError(
            "Ollama is unavailable. Start Ollama and make sure it is listening "
            "on port 11434."
        ) from exc

    if response.status_code >= 400:
        detail = ""
        try:
            error_body = response.json()
            if isinstance(error_body, dict) and isinstance(error_body.get("error"), str):
                detail = f" ({error_body['error']})"
        except ValueError:
            pass
        raise AIServiceError(
            f"Ollama returned HTTP {response.status_code}{detail}. "
            f"Check that the model '{OLLAMA_MODEL}' is installed."
        )

    try:
        response_body = response.json()
    except ValueError as exc:
        raise AIServiceError("Ollama returned an invalid JSON response.") from exc

    result = response_body.get("response") if isinstance(response_body, dict) else None
    if not isinstance(result, str) or not result.strip():
        raise AIServiceError("Ollama returned no generated text.")
    return result.strip()
