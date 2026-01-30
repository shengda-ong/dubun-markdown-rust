import { initDebugLogger } from './utils/debugLogger.js';
import { loadView } from './utils/viewLoader.js';

// Uncomment to enable on-screen debugging
initDebugLogger();

// Safely try to access Tauri internals
let invoke;
try {
  if (window.__TAURI__) {
    invoke = window.__TAURI__.core.invoke;
  } else {
    console.warn("Tauri API not found. Running in browser mode?");
  }
} catch (e) {
  console.error("Error accessing Tauri API:", e);
}

let welcomeView;
let editorView;

async function initApp() {
  console.log("Initializing app...");
  const appContainer = document.getElementById("app-container");

  try {
    welcomeView = await loadView("welcome");
    editorView = await loadView("editor");

    // Clear the loading text (only after success)
    const loader = appContainer.querySelector("h1");
    if (loader) loader.remove();

    // Start the transition timer
    setTimeout(() => {
      startApp();
    }, 3000);
  } catch (error) {
    console.error("Failed to load views:", error);

    // Put the error on screen for the user
    if (appContainer) {
      appContainer.innerHTML = `<h2 style="color: red; text-align: center; margin-top: 20vh;">Error: ${error.message}</h2>`;
    }
  }
}

async function startApp() {
  console.log("Starting session...");

  if (welcomeView && editorView) {
    welcomeView.classList.add("hidden");

    setTimeout(() => {
      editorView.classList.remove("hidden");
    }, 500);
  }
}

// Check if DOM is already loaded
if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
