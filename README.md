# Dubun Markdown Editor

A minimalist, powerful Markdown editor built with Tauri and Vanilla JS.

## Prerequisites

To run this project, you need to have the following installed on your machine:

1.  **Rust**: The systems programming language used by Tauri.
    -   Install via `rustup`: [https://rustup.rs/](https://rustup.rs/)
2.  **Tauri CLI**: To execute the Tauri commands.
    ```bash
    cargo install tauri-cli
    ```
3.  **System Dependencies**:
    -   **Windows**: Microsoft Visual Studio C++ Build Tools (usually installed with Rust).
    -   **macOS**: Xcode Command Line Tools (`xcode-select --install`).
    -   **Linux**: Check the [Tauri setup guide](https://v2.tauri.app/start/prerequisites/#linux) for distro-specific dependencies (e.g., `libwebkit2gtk`).

## Setup

1.  Clone the repository and navigate to the `frontend` directory:
    ```bash
    cd frontend
    ```

## Development

To run the application in development mode (with hot reload enabled):

```bash
cargo tauri dev
```

The application window should appear after the build completes. Note that the first build might take a few minutes as it compiles all dependencies.

## Architecture

-   **Frontend**: Vanilla JavaScript, HTML, CSS (in `src/`).
-   **Backend**: Rust (in `src-tauri/`).
-   **Communication**: Access to Tauri APIs is enabled via the global `window.__TAURI__` object.

## Troubleshooting

-   **Window not showing?**
    -   Check that `core:window:allow-show` is in `src-tauri/capabilities/default.json`.
-   **Tauri command not found?**
    -   Ensure `cargo install tauri-cli` ran successfully.

## Features

### Block-Based Editor
Dubun uses a Notion-style block architecture where every paragraph, heading, or list item is a distinct entity.

-   **Dual Modes**:
    -   **Navigation Mode**: Select blocks, move up/down, delete blocks. (Blue/Hidden border)
    -   **Edit Mode**: Type content with full focus. (Subtle Gray border)
-   **Split & Merge**:
    -   `Shift + Enter`: Splits a block at the cursor (mid-text support).
    -   `Backspace` (at start): Merges the current block into the previous one.
-   **Clean UI**:
    -   Distraction-free interface.
    -   Focus-only styling (borders appear only when editing).
    -   Smart placeholders for empty blocks.

### Controls

| Action | Shortcut | Mode |
|String | Key | Context |
|---|---|---|
| **Edit Block** | `Enter` or Click | Navigation |
| **New Block** | `Shift + Enter` | Edit |
| **Split Block** | `Shift + Enter` (mid-text) | Edit |
| **Merge Block** | `Backspace` (at start) | Edit |
| **Exit Edit** | `Esc` or Click Away | Edit |
| **Navigate** | `↑` / `↓` Arrows | Navigation |
| **Delete Block** | `Delete` | Navigation |

## Recent Updates (Phase 2)
-   **Robust Input Logic**: Fixed issues with block splitting and merging (handling newlines and offsets correctly).
-   **Visual Polish**: Implemented transparent borders that only appear on focus, consistent with Dark Mode.
-   **Usability**: Added placeholders for empty blocks to ensure they remain accessible.

## Testing & Quality Assurance
To prevent regressions, a specific test suite has been created for reported bugs:

```bash
# Run regression tests
node --test tests/views/bug_regression.test.js
```

**Covered Scenarios:**
1.  **Text Loss Prevention**: Ensures content is saved (`saveContent`) before any merge operation.
2.  **Whitespace Logic**: Verifies that invisible newlines/whitespace are trimmed to keep the visual state and model state in sync.
3.  **Merge Spacing**: Checks that a space is correctly inserted when merging two non-empty text blocks.
4.  **Empty State Recovery**: Ensures deleting the last block automatically regenerates a new empty block to prevent a "dead" state.
5.  **Split Logic**: Verifies `Shift+Enter` correctly splits text at the specific cursor index.

