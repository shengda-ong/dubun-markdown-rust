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
