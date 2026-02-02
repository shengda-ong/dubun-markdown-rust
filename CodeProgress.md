# Project Walkthrough: Dubun Block Editor

This document provides a technical walkthrough of the current implementation of the Dubun Markdown Editor. It covers the architectural design, core logic flow, and detailed method explanations.

## 1. Architecture Overview

The application follows a **Model-View-Controller (MVC) -ish** pattern, designed for modularity and testability.

*   **Core (Model)**: Manages the *state* of the document (the list of blocks). It is pure logic, unaware of the DOM.
    *   `BlockManager`: The central state store.
    *   `InputLogic`: Maps raw keyboard events to abstract "Commands".
    *   `Parser`: Turns Markdown text into HTML.
*   **Views (View & Controller)**: Manages the DOM and user interaction.
    *   `EditorView`: The main orchestrator (Controller). It listens to events and dispatches commands to the Manager.
    *   `BlockComponent`: The individual UI unit (View). Handles distinct "Edit" vs "Preview" modes.

---

## 2. Core Logic (`src/core/`)

### `BlockManager.js`
This class controls the *list of blocks*. It operates on a simple array `this.blocks`.

*   **`init()`**: Ensures the editor never starts empty. If no blocks exist, it creates a default empty paragraph.
*   **`addBlock(type, content, afterBlockId)`**:
    *   Creates a new `Block` object.
    *   Inserts it into the array. If `afterBlockId` is provided, it splices it *after* that ID; otherwise, it appends to the end.
*   **`deleteBlock(id)`**:
    *   Removes the block with the given ID.
    *   *Self-Healing*: If the last block is deleted, it automatically spawns a new empty one to prevent a "dead state".
*   **`splitBlock(id, cursorIndex)`**:
    *   **Logic**: Takes a block and a cursor position (e.g., "Hello|World").
    *   Slices the content into `left` ("Hello") and `right` ("World").
    *   **Refinement**: It `trimStart()` the right side so the new block starts clean ("World", not " World").
    *   Updates the original block with `left` and creates a new block with `right`.
*   **`mergeBlocks(prevId, currentId)`**:
    *   The most complex operation. Joins two blocks into one.
    *   **`computeMergedContent(prev, curr)`**: A pure helper method I extracted. It handles the text nuances:
        *   Trims trailing newlines from the previous block (common artifact of `contenteditable`).
        *   Intelligently adds a space if merging two text chunks (e.g., "Hello" + "World" -> "Hello World").
    *   After computing text, it updates `prevBlock` and deletes `currBlock`.

### `InputLogic.js`
*   **`determineCommand(event)`**:
    *   Decouples *Key Bindings* from *Actions*.
    *   Input: `KeyboardEvent` (e.g., `Shift+Enter`).
    *   Output: `COMMANDS.NEW_BLOCK`.
    *   This makes it easy to change hotkeys later without rewriting the Editor logic.

---

## 3. View Architecture (`src/views/`)

### `BlockComponent.js` (The UI Unit)
Each block is a DOM element with two states:
1.  **Preview Mode (`.block-preview`)**:
    *   Rendered HTML (via `Parser`).
    *   Clicking it switches to Edit Mode.
2.  **Edit Mode (`.block-editor`)**:
    *   A `contenteditable` div.
    *   **Why contenteditable?** It auto-expands height naturally, unlike `<textarea>`.
    *   **`saveContent()`**: Critical logic. Browsers love adding invisible `\n` or `<br>` to contenteditable. This method calls `.innerText.trim()` to sanitize the input before saving to the Model.

### `EditorView.js` (The Controller)
This class binds everything together. I refactored its main event loop into a **Dispatcher Pattern**.

*   **`handleKeyDown(e, blockId, component)`**:
    *   The entry point for all typing.
    *   Calculates the `Command` (via `InputLogic`).
    *   Switch statement dispatches to specific handlers:
        *   `handleNewBlock`: Saves content, splits if needed, inserts new component, focuses it.
        *   `handleMergeBlock`: Handles `Backspace` at start of line. Merges logic + moves focus + positions cursor.
        *   `handleNavigation`: `ArrowUp`/`Down`. Moves focus between blocks.
        *   `handleDeleteBlock`: `Delete` key behavior (blocks receive this in Navigation Mode).

---

## 4. Key Interaction Flow Example

**Scenario**: User presses `Shift+Enter` inside a block "Hello World" (cursor between 'o' and 'W').

1.  **Event**: `keydown` fires in `BlockComponent`. Bubbles up to `EditorView.handleKeyDown`.
2.  **Analysis**: `InputLogic` sees `Enter + Shift` -> Returns `COMMANDS.NEW_BLOCK`.
3.  **Dispatch**: `EditorView` calls `this.handleNewBlock()`.
4.  **Save**: `component.saveContent()` syncs DOM -> Model ("Hello World").
5.  **Split (Core)**:
    *   `BlockManager.splitBlock` is called.
    *   Splits "Hello World" -> "Hello " and "World".
    *   Trims "World" -> "World".
    *   Model array now has 2 blocks.
6.  **Update (View)**:
    *   Current component updates text to "Hello ".
    *   `EditorView` creates a *new* `BlockComponent` for "World".
    *   Inserts it into the DOM.
7.  **Focus**: `setTimeout` places the cursor at the start of the new "World" block.

## 5. Recent Improvements
1.  **Readability Refactor**: `handleKeyDown` was decentralized into 5 separate methods.
2.  **Split Polish**: Added `trimStart()` to split logic so you don't get annoying leading spaces.
3.  **UX Polish**: Added CSS-based placeholder "Type here... (Press Shift+Enter...)" to guide users.
