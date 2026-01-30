const { invoke } = window.__TAURI__.core;

let welcomeView;
let editorView;

async function startApp() {
  console.log("Starting app...");
  // Invoke Rust command (optional/logging for now)
  // await invoke("start_session");

  // Transition Views
  if (welcomeView && editorView) {
    welcomeView.classList.add("hidden");

    // Wait for the opacity transition to finish (or mostly finish)
    setTimeout(() => {
      editorView.classList.remove("hidden");
    }, 500); // Slight delay to ensure clean crossover
  }
}

window.addEventListener("DOMContentLoaded", () => {
  welcomeView = document.querySelector("#view-welcome");
  editorView = document.querySelector("#view-editor");

  // Auto-transition after 3 seconds
  setTimeout(() => {
    startApp();
  }, 10000);
});
