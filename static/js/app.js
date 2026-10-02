"use strict";

const state = {
  notes: [],
  currentNoteId: null,
  editorIsNew: false,
  editorSaveTimer: null,
  editorSaving: false,
  editorDirty: false,
  aiProgressTimer: null,
  draggedNoteId: null,
  dragOrderCommitted: false,
};

const elements = {
  listView: document.querySelector("#list-view"),
  editorView: document.querySelector("#editor-view"),
  notesGrid: document.querySelector("#notes-grid"),
  emptyState: document.querySelector("#empty-state"),
  noResultsState: document.querySelector("#no-results-state"),
  trashDropZone: document.querySelector("#trash-drop-zone"),
  addNoteButton: document.querySelector("#add-note-button"),
  emptyAddButton: document.querySelector("#empty-add-button"),
  menuButton: document.querySelector("#menu-button"),
  searchToggle: document.querySelector("#search-toggle"),
  searchForm: document.querySelector("#search-form"),
  searchInput: document.querySelector("#search-input"),
  clearSearch: document.querySelector("#clear-search"),
  backButton: document.querySelector("#back-button"),
  editorMode: document.querySelector("#editor-mode"),
  editorHeading: document.querySelector("#editor-heading"),
  editorCard: document.querySelector("#editor-card"),
  editorTitle: document.querySelector("#editor-title"),
  editorContent: document.querySelector("#editor-content"),
  editorMarkdownPreview: document.querySelector("#editor-markdown-preview"),
  writeTab: document.querySelector("#write-tab"),
  previewTab: document.querySelector("#preview-tab"),
  markdownInsertButtons: document.querySelectorAll("[data-markdown-insert]"),
  editorColor: document.querySelector("#editor-color"),
  editorColorPalette: document.querySelector("#editor-color-palette"),
  editorCustomColor: document.querySelector("#editor-custom-color"),
  editorStatus: document.querySelector("#editor-status"),
  editorSaveButton: document.querySelector("#editor-save-button"),
  editorDeleteButton: document.querySelector("#editor-delete-button"),
  editorAiButton: document.querySelector("#editor-ai-button"),
  aiAgentButton: document.querySelector("#ai-agent-button"),
  aiModal: document.querySelector("#ai-agent-modal"),
  aiForm: document.querySelector("#ai-agent-form"),
  aiNoteSelect: document.querySelector("#ai-note-select"),
  aiActionSelect: document.querySelector("#ai-action-select"),
  customPromptField: document.querySelector("#custom-prompt-field"),
  customPrompt: document.querySelector("#ai-custom-prompt"),
  closeAiModal: document.querySelector("#close-ai-modal"),
  cancelAiModal: document.querySelector("#cancel-ai-modal"),
  runAiButton: document.querySelector("#run-ai-button"),
  aiProgressOverlay: document.querySelector("#ai-progress-overlay"),
  aiProgressTitle: document.querySelector("#ai-progress-title"),
  aiPreviewText: document.querySelector("#ai-preview-text"),
  aiProgressBar: document.querySelector("#ai-progress-bar"),
  toast: document.querySelector("#toast"),
};

let toastTimer = null;

const NOTE_COLORS = [
  { color: "#fff6a5", label: "Lemon" },
  { color: "#ffd2d8", label: "Blush" },
  { color: "#cbe8ff", label: "Sky" },
  { color: "#cbeed6", label: "Mint" },
  { color: "#ded7ff", label: "Lilac" },
  { color: "#ffd9b8", label: "Peach" },
];

document.addEventListener("DOMContentLoaded", () => {
  loadNotes();
  elements.addNoteButton.addEventListener("click", () => openEditor());
  elements.emptyAddButton.addEventListener("click", () => openEditor());
  elements.trashDropZone.addEventListener("dragover", handleTrashDragOver);
  elements.trashDropZone.addEventListener("dragleave", handleTrashDragLeave);
  elements.trashDropZone.addEventListener("drop", handleTrashDrop);
  elements.menuButton.addEventListener("click", () => showToast("You are viewing all notes."));
  elements.backButton.addEventListener("click", closeEditor);
  elements.editorSaveButton.addEventListener("click", () => saveEditorNote(true));
  elements.editorDeleteButton.addEventListener("click", deleteCurrentNote);
  elements.editorAiButton.addEventListener("click", () => openAiAgent(state.currentNoteId));
  elements.editorTitle.addEventListener("input", handleEditorInput);
  elements.editorContent.addEventListener("input", handleEditorInput);
  elements.writeTab.addEventListener("click", () => setEditorMode("write"));
  elements.previewTab.addEventListener("click", () => setEditorMode("preview"));
  elements.markdownInsertButtons.forEach((button) => {
    button.addEventListener("click", () => insertMarkdown(button.dataset.markdownInsert));
  });
  elements.editorCustomColor.addEventListener("input", handleCustomColorInput);
  elements.searchToggle.addEventListener("click", toggleSearch);
  elements.searchInput.addEventListener("input", renderNotes);
  elements.clearSearch.addEventListener("click", clearSearch);
  elements.aiAgentButton.addEventListener("click", () => openAiAgent(state.currentNoteId));
  elements.aiActionSelect.addEventListener("change", toggleCustomPrompt);
  elements.aiForm.addEventListener("submit", handleAiSubmit);
  elements.closeAiModal.addEventListener("click", () => closeAiAgent());
  elements.cancelAiModal.addEventListener("click", () => closeAiAgent());
  elements.aiModal.addEventListener("click", (event) => {
    if (event.target === elements.aiModal) closeAiAgent();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!elements.aiModal.hidden) closeAiAgent();
    else if (!elements.editorView.hidden) closeEditor();
  });
});

async function apiRequest(url, options = {}) {
  const response = await fetch(url, options);
  let payload = null;
  try { payload = await response.json(); } catch (_error) { /* handled below */ }
  if (!response.ok) throw new Error(payload?.error || `Request failed with HTTP ${response.status}.`);
  return payload;
}

async function loadNotes() {
  try {
    state.notes = await apiRequest("/api/notes");
    renderNotes();
  } catch (error) {
    showToast(`Could not load notes: ${error.message}`, "error");
  }
}

function renderNotes() {
  const query = elements.searchInput.value.trim().toLowerCase();
  const filteredNotes = state.notes.filter((note) => !query || `${note.title} ${note.content}`.toLowerCase().includes(query));
  elements.notesGrid.replaceChildren(...filteredNotes.map(createNoteCard));
  const hasNotes = state.notes.length > 0;
  elements.emptyState.hidden = hasNotes || Boolean(query);
  elements.noResultsState.hidden = !hasNotes || !query || filteredNotes.length > 0;
}

function createNoteCard(note) {
  const card = document.createElement("article");
  card.className = "note-card";
  card.dataset.noteId = String(note.id);
  card.draggable = true;
  card.style.setProperty("--note-color", note.color);
  card.addEventListener("dragstart", (event) => handleNoteDragStart(event, card, note.id));
  card.addEventListener("dragover", (event) => handleNoteDragOver(event, card));
  card.addEventListener("drop", (event) => handleNoteDrop(event));
  card.addEventListener("dragend", handleNoteDragEnd);

  const openButton = document.createElement("div");
  openButton.className = "note-card-open";
  openButton.setAttribute("role", "button");
  openButton.tabIndex = 0;
  openButton.setAttribute("aria-label", `Open ${note.title || "untitled note"}`);
  openButton.addEventListener("click", (event) => {
    if (event.target.closest(".markdown-task-control, a")) return;
    openEditor(note.id);
  });
  openButton.addEventListener("keydown", (event) => {
    if ((event.key === "Enter" || event.key === " ") && !event.target.closest(".markdown-task-control, a")) {
      event.preventDefault();
      openEditor(note.id);
    }
  });

  const topline = document.createElement("div");
  topline.className = "note-card-topline";
  const chip = document.createElement("span");
  chip.className = "note-color-chip";
  chip.style.backgroundColor = note.color;
  chip.setAttribute("aria-hidden", "true");
  const date = document.createElement("span");
  date.className = "note-date";
  date.textContent = formatDate(note.updated_at || note.created_at);
  topline.append(chip, date);

  const title = document.createElement("h3");
  title.textContent = note.title || "Untitled note";
  const preview = document.createElement("div");
  preview.className = "note-preview markdown-preview";
  preview.innerHTML = renderMarkdown(note.content || "An empty note waiting for your next idea.", {
    taskLineAttribute: "data-task-line",
  });
  preview.querySelectorAll("input[data-task-line]").forEach((checkbox) => {
    checkbox.classList.add("markdown-task-control");
    checkbox.addEventListener("click", (event) => event.stopPropagation());
    checkbox.addEventListener("change", () => {
      toggleTaskInNote(note.id, Number(checkbox.dataset.taskLine), checkbox.checked, checkbox);
    });
  });

  const footer = document.createElement("div");
  footer.className = "note-card-footer";
  const openLabel = document.createElement("span");
  openLabel.className = "open-label";
  openLabel.textContent = "Open note  ›";
  footer.append(openLabel);

  openButton.append(topline, title, preview, footer);
  card.append(openButton);
  return card;
}

function handleNoteDragStart(event, card, noteId) {
  if (!event.dataTransfer) return;
  state.draggedNoteId = noteId;
  state.dragOrderCommitted = false;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", String(noteId));
  card.classList.add("is-dragging");
  elements.trashDropZone.hidden = false;
}

function handleNoteDragOver(event, card) {
  if (state.draggedNoteId === null || Number(card.dataset.noteId) === state.draggedNoteId) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";

  const draggedCard = elements.notesGrid.querySelector(`[data-note-id="${state.draggedNoteId}"]`);
  if (!draggedCard) return;
  const rect = card.getBoundingClientRect();
  const insertAfter = event.clientY > rect.top + rect.height / 2;
  if (insertAfter && card.nextElementSibling !== draggedCard) card.after(draggedCard);
  if (!insertAfter && card.previousElementSibling !== draggedCard) card.before(draggedCard);

  elements.notesGrid.querySelectorAll(".note-card").forEach((item) => item.classList.remove("drop-target"));
  card.classList.add("drop-target");
}

function handleNoteDrop(event) {
  if (state.draggedNoteId === null) return;
  event.preventDefault();
  state.dragOrderCommitted = true;
  persistNoteOrder();
}

function handleNoteDragEnd() {
  if (!state.dragOrderCommitted) renderNotes();
  clearDragVisuals();
  state.draggedNoteId = null;
  state.dragOrderCommitted = false;
}

function handleTrashDragOver(event) {
  if (state.draggedNoteId === null) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  elements.trashDropZone.classList.add("is-active");
}

function handleTrashDragLeave(event) {
  if (!elements.trashDropZone.contains(event.relatedTarget)) {
    elements.trashDropZone.classList.remove("is-active");
  }
}

async function handleTrashDrop(event) {
  if (state.draggedNoteId === null) return;
  event.preventDefault();
  const noteId = state.draggedNoteId;
  const note = state.notes.find((item) => item.id === noteId);
  elements.trashDropZone.classList.remove("is-active");
  if (!note) return;

  const confirmed = window.confirm(`Delete “${note.title || "Untitled note"}”? This cannot be undone.`);
  if (!confirmed) {
    state.dragOrderCommitted = false;
    renderNotes();
    return;
  }

  state.dragOrderCommitted = true;
  try {
    await apiRequest(`/api/notes/${noteId}`, { method: "DELETE" });
    state.notes = state.notes.filter((item) => item.id !== noteId);
    renderNotes();
    showToast("Note moved to trash and deleted.");
  } catch (error) {
    state.dragOrderCommitted = false;
    renderNotes();
    showToast(`Could not delete note: ${error.message}`, "error");
  }
}

async function persistNoteOrder() {
  const orderedIds = [...elements.notesGrid.querySelectorAll(".note-card")]
    .map((card) => Number(card.dataset.noteId));
  const previousNotes = [...state.notes];
  state.notes = orderedIds
    .map((id) => previousNotes.find((note) => note.id === id))
    .filter(Boolean);

  try {
    state.notes = await apiRequest("/api/notes/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note_ids: orderedIds }),
    });
    renderNotes();
    showToast("Note order saved.");
  } catch (error) {
    state.notes = previousNotes;
    renderNotes();
    showToast(`Could not save note order: ${error.message}`, "error");
  }
}

function clearDragVisuals() {
  elements.trashDropZone.hidden = true;
  elements.trashDropZone.classList.remove("is-active");
  elements.notesGrid.querySelectorAll(".note-card").forEach((card) => {
    card.classList.remove("is-dragging", "drop-target");
  });
}

function openEditor(noteId = null) {
  const note = noteId === null ? null : state.notes.find((item) => item.id === noteId);
  state.currentNoteId = note?.id ?? null;
  state.editorIsNew = !note;
  state.editorDirty = false;
  clearEditorTimer();
  elements.editorMode.textContent = note ? "EDIT NOTE" : "NEW NOTE";
  elements.editorHeading.textContent = note?.title || (note ? "Untitled note" : "Write something");
  elements.editorTitle.value = note?.title || "";
  elements.editorContent.value = note?.content || "";
  elements.editorColor.value = note?.color || "#fff6a5";
  elements.editorColor.value = normalizeColor(elements.editorColor.value);
  elements.editorCustomColor.value = elements.editorColor.value;
  renderColorPalette(elements.editorColor.value);
  elements.editorCard.style.setProperty("--note-color", elements.editorColor.value);
  renderEditorMarkdownPreview();
  setEditorMode("write");
  elements.editorStatus.textContent = note ? "Saved" : "Ready to write";
  elements.editorDeleteButton.hidden = !note;
  elements.editorView.hidden = false;
  elements.listView.hidden = true;
  window.scrollTo({ top: 0, behavior: "smooth" });
  window.setTimeout(() => elements.editorTitle.focus(), 60);
}

function closeEditor() {
  clearEditorTimer();
  state.currentNoteId = null;
  state.editorIsNew = false;
  state.editorDirty = false;
  elements.editorView.hidden = true;
  elements.listView.hidden = false;
  renderNotes();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function handleEditorInput() {
  state.editorDirty = true;
  elements.editorStatus.textContent = "Unsaved changes";
  elements.editorHeading.textContent = elements.editorTitle.value.trim() || "Untitled note";
  renderEditorMarkdownPreview();
  if (state.editorIsNew) return;
  clearEditorTimer();
  state.editorSaveTimer = window.setTimeout(() => saveEditorNote(false), 800);
}

function setEditorMode(mode) {
  const isPreview = mode === "preview";
  elements.editorContent.hidden = isPreview;
  elements.editorMarkdownPreview.hidden = !isPreview;
  elements.writeTab.classList.toggle("is-active", !isPreview);
  elements.previewTab.classList.toggle("is-active", isPreview);
  elements.writeTab.setAttribute("aria-selected", String(!isPreview));
  elements.previewTab.setAttribute("aria-selected", String(isPreview));
  if (isPreview) renderEditorMarkdownPreview();
}

function insertMarkdown(kind) {
  const snippets = {
    bold: { before: "**", after: "**", placeholder: "bold text" },
    italic: { before: "*", after: "*", placeholder: "italic text" },
    bullet: { before: "- ", after: "", placeholder: "list item" },
    task: { before: "- [_] ", after: "", placeholder: "task" },
  };
  const snippet = snippets[kind];
  if (!snippet) return;
  const start = elements.editorContent.selectionStart;
  const end = elements.editorContent.selectionEnd;
  const selected = elements.editorContent.value.slice(start, end) || snippet.placeholder;
  const replacement = `${snippet.before}${selected}${snippet.after}`;
  elements.editorContent.setRangeText(replacement, start, end, "select");
  elements.editorContent.focus();
  handleEditorInput();
}

function renderEditorMarkdownPreview() {
  if (!elements.editorMarkdownPreview) return;
  elements.editorMarkdownPreview.innerHTML = renderMarkdown(elements.editorContent.value, {
    taskLineAttribute: "data-task-line",
  });
  elements.editorMarkdownPreview.querySelectorAll("input[data-task-line]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      updateEditorTask(Number(checkbox.dataset.taskLine), checkbox.checked);
    });
  });
}

function updateEditorTask(lineIndex, checked) {
  const lines = elements.editorContent.value.split(/\r?\n/);
  if (!Number.isInteger(lineIndex) || !lines[lineIndex]) return;
  lines[lineIndex] = replaceTaskMarker(lines[lineIndex], checked);
  elements.editorContent.value = lines.join("\n");
  handleEditorInput();
}

async function toggleTaskInNote(noteId, lineIndex, checked, checkbox) {
  const note = state.notes.find((item) => item.id === noteId);
  if (!note) return;
  const lines = note.content.split(/\r?\n/);
  if (!Number.isInteger(lineIndex) || !lines[lineIndex]) return;
  const updatedContent = lines.map((line, index) => (
    index === lineIndex ? replaceTaskMarker(line, checked) : line
  )).join("\n");

  try {
    const updated = await apiRequest(`/api/notes/${noteId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: note.title, content: updatedContent, color: note.color }),
    });
    replaceStateNote(updated);
    renderNotes();
  } catch (error) {
    checkbox.checked = !checked;
    showToast(`Could not save checkbox: ${error.message}`, "error");
  }
}

function replaceTaskMarker(line, checked) {
  return line.replace(/\[(?:x|_| )\]/i, checked ? "[x]" : "[_]");
}

function handleCustomColorInput() {
  applyEditorColor(elements.editorCustomColor.value);
}

function applyEditorColor(color) {
  state.editorDirty = true;
  elements.editorColor.value = normalizeColor(color);
  elements.editorCustomColor.value = elements.editorColor.value;
  renderColorPalette(elements.editorColor.value);
  elements.editorCard.style.setProperty("--note-color", elements.editorColor.value);
  elements.editorStatus.textContent = "Unsaved changes";
  if (state.editorIsNew) return;
  clearEditorTimer();
  state.editorSaveTimer = window.setTimeout(() => saveEditorNote(false), 800);
}

function renderColorPalette(selectedColor) {
  const normalizedSelected = normalizeColor(selectedColor);
  const presetMatch = NOTE_COLORS.some((preset) => preset.color === normalizedSelected);
  elements.editorColorPalette.replaceChildren(
    ...NOTE_COLORS.map((preset) => {
      const swatch = document.createElement("button");
      swatch.className = "color-swatch";
      swatch.type = "button";
      swatch.style.backgroundColor = preset.color;
      swatch.title = preset.label;
      swatch.setAttribute("aria-label", `${preset.label} note color`);
      swatch.setAttribute("role", "radio");
      swatch.setAttribute("aria-checked", String(preset.color === normalizedSelected));
      swatch.addEventListener("click", () => applyEditorColor(preset.color));
      return swatch;
    }),
  );
  elements.editorCustomColor.parentElement.classList.toggle("is-selected", !presetMatch);
}

async function saveEditorNote(showToastAfterSave) {
  clearEditorTimer();
  if (state.editorSaving || (!state.editorDirty && !state.editorIsNew)) return;
  if (!elements.editorContent.value.trim()) {
    elements.editorStatus.textContent = "Add some content before saving";
    elements.editorContent.focus();
    return;
  }

  const payload = { title: elements.editorTitle.value.trim(), content: elements.editorContent.value, color: elements.editorColor.value };
  const requestUrl = state.editorIsNew ? "/api/notes" : `/api/notes/${state.currentNoteId}`;
  state.editorSaving = true;
  state.editorDirty = false;
  setButtonLoading(elements.editorSaveButton, true, "Saving…");
  elements.editorStatus.textContent = "Saving…";

  try {
    const saved = await apiRequest(requestUrl, {
      method: state.editorIsNew ? "POST" : "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (state.editorIsNew) {
      state.notes.unshift(saved);
      state.currentNoteId = saved.id;
      state.editorIsNew = false;
      elements.editorMode.textContent = "EDIT NOTE";
      elements.editorDeleteButton.hidden = false;
    } else {
      replaceStateNote(saved);
    }
    elements.editorHeading.textContent = saved.title || "Untitled note";
    elements.editorStatus.textContent = "Saved";
    if (showToastAfterSave) showToast("Note saved.");
    renderNotes();
  } catch (error) {
    state.editorDirty = true;
    elements.editorStatus.textContent = "Save failed";
    showToast(`Could not save note: ${error.message}`, "error");
  } finally {
    state.editorSaving = false;
    setButtonLoading(elements.editorSaveButton, false, "Save");
    if (state.editorDirty && !state.editorIsNew) state.editorSaveTimer = window.setTimeout(() => saveEditorNote(false), 0);
  }
}

async function deleteCurrentNote() {
  if (state.editorIsNew || state.currentNoteId === null) { closeEditor(); return; }
  if (!window.confirm("Delete this note? This cannot be undone.")) return;
  try {
    await apiRequest(`/api/notes/${state.currentNoteId}`, { method: "DELETE" });
    state.notes = state.notes.filter((note) => note.id !== state.currentNoteId);
    showToast("Note deleted.");
    closeEditor();
  } catch (error) {
    showToast(`Could not delete note: ${error.message}`, "error");
  }
}

function toggleSearch() {
  elements.searchForm.hidden = !elements.searchForm.hidden;
  elements.searchToggle.setAttribute("aria-expanded", String(!elements.searchForm.hidden));
  if (!elements.searchForm.hidden) elements.searchInput.focus();
}

function clearSearch() {
  elements.searchInput.value = "";
  renderNotes();
  elements.searchInput.focus();
}

function openAiAgent(preferredNoteId = null) {
  populateAiNoteSelect(preferredNoteId);
  elements.aiActionSelect.value = "summarize";
  elements.customPrompt.value = "";
  toggleCustomPrompt();
  elements.aiModal.hidden = false;
  window.setTimeout(() => elements.aiNoteSelect.focus(), 60);
}

function closeAiAgent() {
  if (!elements.runAiButton.disabled) elements.aiModal.hidden = true;
}

function populateAiNoteSelect(preferredNoteId) {
  elements.aiNoteSelect.replaceChildren();
  for (const note of state.notes) {
    const option = document.createElement("option");
    option.value = String(note.id);
    option.textContent = note.title || "Untitled note";
    elements.aiNoteSelect.append(option);
  }
  if (preferredNoteId !== null && state.notes.some((note) => note.id === preferredNoteId)) elements.aiNoteSelect.value = String(preferredNoteId);
  elements.aiNoteSelect.disabled = state.notes.length === 0;
  if (state.notes.length === 0) {
    const option = document.createElement("option");
    option.textContent = "Create a note first";
    option.value = "";
    elements.aiNoteSelect.append(option);
  }
}

function toggleCustomPrompt() {
  elements.customPromptField.hidden = elements.aiActionSelect.value !== "custom";
  elements.customPrompt.required = elements.aiActionSelect.value === "custom";
}

async function handleAiSubmit(event) {
  event.preventDefault();
  const noteId = Number(elements.aiNoteSelect.value);
  const action = elements.aiActionSelect.value;
  const customPrompt = elements.customPrompt.value.trim();
  const note = state.notes.find((item) => item.id === noteId);
  if (!noteId || !action) { showToast("Create a note before asking the AI Agent.", "error"); return; }
  if (!note) { showToast("That note is no longer available. Refresh and try again.", "error"); return; }
  if (action === "custom" && !customPrompt) { elements.customPrompt.focus(); return; }

  const payload = { action };
  if (action === "custom") payload.custom_prompt = customPrompt;
  startAiProgress(note, action);
  setButtonLoading(elements.runAiButton, true, "Working…");
  elements.aiNoteSelect.disabled = true;
  elements.aiActionSelect.disabled = true;

  try {
    const result = await apiRequest(`/api/notes/${noteId}/ai-action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const updated = result.updated_note;
    replaceStateNote(updated);
    if (state.currentNoteId === updated.id && !elements.editorView.hidden) {
      elements.editorTitle.value = updated.title;
      elements.editorContent.value = updated.content;
      elements.editorColor.value = updated.color;
      elements.editorHeading.textContent = updated.title || "Untitled note";
      elements.editorCard.style.setProperty("--note-color", updated.color);
      elements.editorCustomColor.value = updated.color;
      renderColorPalette(updated.color);
      renderEditorMarkdownPreview();
      state.editorDirty = false;
      elements.editorStatus.textContent = "Saved by AI Agent";
    }
    renderNotes();
    elements.aiModal.hidden = true;
    showToast("AI result applied to the note.");
  } catch (error) {
    showToast(`AI action failed: ${error.message}`, "error");
  } finally {
    stopAiProgress();
    setButtonLoading(elements.runAiButton, false, "Run AI action");
    elements.aiNoteSelect.disabled = false;
    elements.aiActionSelect.disabled = false;
  }
}

function startAiProgress(note, action) {
  stopAiProgress();
  const source = (note.content || "").replace(/\s+/g, " ").trim();
  const actionLabel = {
    summarize: "summary",
    fix_spelling: "corrected wording",
    expand: "action items",
    custom: "your requested update",
  }[action] || "updated wording";
  const stages = [
    { title: "Reading your note…", progress: 16 },
    { title: "Finding the clearest phrasing…", progress: 42 },
    { title: `Drafting ${actionLabel}…`, progress: 68 },
    { title: "Polishing the final wording…", progress: 86 },
  ];
  let stageIndex = 0;

  const renderStage = () => {
    const stage = stages[stageIndex];
    elements.aiProgressTitle.textContent = stage.title;
    elements.aiProgressBar.style.width = `${stage.progress}%`;
    elements.aiPreviewText.textContent = buildWorkingPreview(source, action, stageIndex, actionLabel);
  };

  elements.aiProgressOverlay.hidden = false;
  elements.aiProgressOverlay.setAttribute("aria-busy", "true");
  renderStage();
  state.aiProgressTimer = window.setInterval(() => {
    stageIndex = Math.min(stageIndex + 1, stages.length - 1);
    renderStage();
  }, 900);
}

function buildWorkingPreview(source, action, stageIndex, actionLabel) {
  if (!source) return "Starting with your note and preparing a clean draft…";
  if (stageIndex === 0) return source;
  if (stageIndex === 1) {
    const excerpt = source.length > 118 ? `${source.slice(0, 118)}…` : source;
    return `Keeping the meaning of “${excerpt}” while checking the structure…`;
  }
  if (stageIndex === 2) return `Preparing a ${actionLabel} from the ideas in your note…`;
  return action === "summarize"
    ? "Condensing the key idea into a concise final version…"
    : "Applying the final pass before the updated note is returned…";
}

function stopAiProgress() {
  if (state.aiProgressTimer) {
    clearInterval(state.aiProgressTimer);
    state.aiProgressTimer = null;
  }
  elements.aiProgressOverlay.hidden = true;
  elements.aiProgressOverlay.setAttribute("aria-busy", "false");
  elements.aiProgressBar.style.width = "14%";
}

function replaceStateNote(updated) {
  const index = state.notes.findIndex((note) => note.id === updated.id);
  if (index >= 0) state.notes[index] = updated;
}

function clearEditorTimer() {
  if (state.editorSaveTimer) { clearTimeout(state.editorSaveTimer); state.editorSaveTimer = null; }
}

function setButtonLoading(button, loading, label) {
  button.disabled = loading;
  button.innerHTML = loading ? `<span class="spinner" aria-hidden="true"></span>${label}` : label;
}

function formatDate(value) {
  if (!value) return "Just now";
  const parsed = new Date(value.replace(" ", "T") + "Z");
  if (Number.isNaN(parsed.getTime())) return "Just now";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(parsed);
}

function renderMarkdown(markdown, options = {}) {
  const lines = String(markdown || "").replace(/\r\n?/g, "\n").split("\n");
  const taskLineAttribute = options.taskLineAttribute || "data-task-line";
  const html = [];
  let listType = null;
  let inCodeBlock = false;
  let codeLines = [];

  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };

  const closeCodeBlock = () => {
    if (inCodeBlock) {
      html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
      codeLines = [];
      inCodeBlock = false;
    }
  };

  lines.forEach((line, lineIndex) => {
    if (/^\s*```/.test(line)) {
      if (inCodeBlock) closeCodeBlock();
      else {
        closeList();
        inCodeBlock = true;
      }
      return;
    }
    if (inCodeBlock) {
      codeLines.push(line);
      return;
    }

    if (!line.trim()) {
      closeList();
      return;
    }

    const taskMatch = line.match(/^\s*(?:(?:[-*+]|\d+[.)])\s+)?\[(x|_| )\]\s+(.+)$/i);
    if (taskMatch) {
      closeList();
      const checked = taskMatch[1].toLowerCase() === "x";
      html.push(
        `<label class="markdown-task"><input type="checkbox" ${taskLineAttribute}="${lineIndex}" ${checked ? "checked" : ""}><span>${renderInlineMarkdown(taskMatch[2])}</span></label>`,
      );
      return;
    }

    const headingMatch = line.match(/^\s*(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      closeList();
      const level = headingMatch[1].length;
      html.push(`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`);
      return;
    }

    const unorderedMatch = line.match(/^\s*[-*+]\s+(.+)$/);
    const orderedMatch = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (unorderedMatch || orderedMatch) {
      const nextListType = orderedMatch ? "ol" : "ul";
      if (listType && listType !== nextListType) closeList();
      if (!listType) {
        listType = nextListType;
        html.push(`<${listType}>`);
      }
      html.push(`<li>${renderInlineMarkdown((unorderedMatch || orderedMatch)[1])}</li>`);
      return;
    }

    const quoteMatch = line.match(/^\s*>\s?(.*)$/);
    if (quoteMatch) {
      closeList();
      html.push(`<blockquote>${renderInlineMarkdown(quoteMatch[1])}</blockquote>`);
      return;
    }

    closeList();
    html.push(`<p>${renderInlineMarkdown(line)}</p>`);
  });

  closeCodeBlock();
  closeList();
  return html.join("") || "<p class=\"markdown-empty\">Nothing to preview yet.</p>";
}

function renderInlineMarkdown(value) {
  let result = escapeHtml(value);
  result = result.replace(/`([^`]+)`/g, "<code>$1</code>");
  result = result.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  result = result.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  result = result.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  result = result.replace(/(^|[^_])_([^_]+)_/g, "$1<em>$2</em>");
  result = result.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return result;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeColor(color) {
  const value = String(color || "#fff6a5").toLowerCase();
  const shortHex = /^#([0-9a-f]{3})$/i.exec(value);
  if (shortHex) return `#${shortHex[1].split("").map((digit) => digit + digit).join("")}`;
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#fff6a5";
}

function showToast(message, type = "") {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.className = `toast ${type}`.trim();
  elements.toast.hidden = false;
  toastTimer = window.setTimeout(() => { elements.toast.hidden = true; }, 4500);
}
