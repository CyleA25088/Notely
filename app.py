"""Flask entry point for the local sticky-notes application."""

from __future__ import annotations

import os
import re
from typing import Any

from flask import Flask, jsonify, render_template, request

import database
from ai_service import AIServiceError, ensure_ollama_running, generate_ai_result


app = Flask(__name__)
database.init_db()

DEFAULT_COLOR = "#fff6a5"
VALID_AI_ACTIONS = {"summarize", "fix_spelling", "expand", "custom"}
HEX_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?$")


def _json_body() -> dict[str, Any]:
    """Return a JSON object or raise a client-friendly validation error."""

    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        raise ValueError("Request body must be a JSON object.")
    return body


def _note_payload(body: dict[str, Any]) -> tuple[str, str, str]:
    """Validate and normalize a create/update note payload."""

    title = body.get("title", "")
    content = body.get("content")
    color = body.get("color", DEFAULT_COLOR)

    if title is None:
        title = ""
    if not isinstance(title, str):
        raise ValueError("title must be a string.")
    if not isinstance(content, str):
        raise ValueError("content must be a string.")
    if not isinstance(color, str) or not HEX_COLOR_RE.fullmatch(color):
        raise ValueError("color must be a three- or six-digit hexadecimal color.")

    return title.strip(), content, color.lower()


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/notes")
def list_notes():
    return jsonify(database.list_notes())


@app.put("/api/notes/reorder")
def reorder_notes():
    try:
        body = _json_body()
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    note_ids = body.get("note_ids")
    if (
        not isinstance(note_ids, list)
        or not note_ids
        or any(isinstance(note_id, bool) or not isinstance(note_id, int) for note_id in note_ids)
    ):
        return jsonify({"error": "note_ids must be a non-empty list of integers."}), 400

    current_ids = {note["id"] for note in database.list_notes()}
    if len(note_ids) != len(current_ids) or set(note_ids) != current_ids:
        return jsonify({"error": "note_ids must contain every saved note exactly once."}), 400

    return jsonify(database.reorder_notes(note_ids))


@app.post("/api/notes")
def create_note():
    try:
        title, content, color = _note_payload(_json_body())
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    note = database.create_note(title=title, content=content, color=color)
    return jsonify(note), 201


@app.put("/api/notes/<int:note_id>")
def update_note(note_id: int):
    try:
        title, content, color = _note_payload(_json_body())
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    note = database.update_note(
        note_id, title=title, content=content, color=color
    )
    if note is None:
        return jsonify({"error": "Note not found."}), 404
    return jsonify(note)


@app.delete("/api/notes/<int:note_id>")
def delete_note(note_id: int):
    if not database.delete_note(note_id):
        return jsonify({"error": "Note not found."}), 404
    return jsonify({"message": "Note deleted."})


@app.post("/api/notes/<int:note_id>/ai-action")
def ai_action(note_id: int):
    try:
        body = _json_body()
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    action = body.get("action")
    if action not in VALID_AI_ACTIONS:
        return jsonify({"error": "action must be a supported AI action."}), 400

    custom_prompt = body.get("custom_prompt", "")
    if action == "custom" and (
        not isinstance(custom_prompt, str) or not custom_prompt.strip()
    ):
        return jsonify({"error": "custom_prompt is required for a custom action."}), 400
    if custom_prompt is not None and not isinstance(custom_prompt, str):
        return jsonify({"error": "custom_prompt must be a string."}), 400

    note = database.get_note(note_id)
    if note is None:
        return jsonify({"error": "Note not found."}), 404

    try:
        result = generate_ai_result(
            action=action,
            content=note["content"],
            custom_prompt=custom_prompt,
        )
    except AIServiceError as exc:
        return jsonify({"error": str(exc)}), exc.status_code

    updated_note = database.update_note(
        note_id,
        title=note["title"],
        content=result,
        color=note["color"],
    )
    if updated_note is None:
        return jsonify({"error": "Note was removed while AI was running."}), 404

    return jsonify({"result": result, "updated_note": updated_note})


@app.errorhandler(404)
def not_found(error):  # noqa: ARG001 - Flask passes the original exception.
    if request.path.startswith("/api/"):
        return jsonify({"error": "Endpoint not found."}), 404
    return error


@app.errorhandler(500)
def internal_error(error):  # noqa: ARG001 - Flask passes the original exception.
    if request.path.startswith("/api/"):
        return jsonify({"error": "An unexpected server error occurred."}), 500
    return error


if __name__ == "__main__":
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "5000"))
    debug = os.getenv("FLASK_DEBUG", "0").lower() in {"1", "true", "yes"}
    try:
        ensure_ollama_running()
        print("Ollama is ready.")
    except AIServiceError as exc:
        # Keep the notes app available even when Ollama is not installed yet.
        # An AI request will show the same actionable message in the UI.
        print(f"Ollama auto-start notice: {exc}")
    app.run(host=host, port=port, debug=debug)
