# Sticky Notes AI

A mobile-first local sticky notes app with Markdown editing, draggable notes, a trash drop zone, and local Ollama AI assistance.

## Instructions for Build and Use

Steps to build and/or run the software:

1. Open PowerShell in the project folder.
2. Run the idempotent installer:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\install.ps1 -PullOllamaModel
   ```

3. Activate the virtual environment:

   ```powershell
   .\.venv\Scripts\Activate.ps1
   ```

4. Start the application:

   ```powershell
   python app.py
   ```

Instructions for using the software:

1. Open [http://127.0.0.1:5000](http://127.0.0.1:5000) in a browser.
2. Create a note with the `+` button and edit its title, content, and color.
3. Use the Write and Preview tabs for Markdown formatting.
4. Use `[x]`, `[_]`, or `[ ]` for interactive checklist items.
5. Drag notes to reorder them or drag a note to the trash area to delete it.
6. Use the AI Agent button in the top-right corner to summarize, polish, expand, or customize a note.

## Development Environment

To recreate the development environment, you need the following software and/or libraries with the specified versions:

* Windows with PowerShell
* Python 3.10 or newer
* Flask 3.0 or newer
* Requests 2.31 or newer
* Ollama with the `llama3.2` model
* SQLite, included with Python

## Useful Websites to Learn More

I found these websites useful in developing this software:

* [Python Documentation](https://docs.python.org/3/)
* [Flask Documentation](https://flask.palletsprojects.com/)
* [Ollama](https://ollama.com/)
* [Markdown Guide](https://www.markdownguide.org/)

## Future Work

The following items I plan to fix, improve, and/or add to this project in the future:

* [ ] Add note import, export, and backup tools
* [ ] Add automated backend and frontend tests
* [ ] Add configurable AI model and Ollama settings
