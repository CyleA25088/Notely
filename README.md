# Sticky Notes AI

## Install

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1 -PullOllamaModel
```

## Run

```powershell
.\.venv\Scripts\Activate.ps1
python app.py
```

- App: `http://127.0.0.1:5000`
- Ollama: auto-starts when installed
- Model: `llama3.2`

## Features

- Markdown write and preview
- `[x]`, `[_]`, and `[ ]` checkboxes
- Drag-to-reorder notes
- Drag-to-trash deletion
- Local SQLite storage
- Local Ollama AI actions
