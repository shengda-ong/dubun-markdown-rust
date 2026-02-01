import { initDebugLogger } from './utils/debugLogger.js';
import { loadView } from './utils/viewLoader.js';
import { cleanEditorContent } from './utils/editorUtils.js';


// Uncomment to enable on-screen debugging
// initDebugLogger();

// Safely try to access Tauri internals
let invoke;
let appWindow;

async function initTauri() {
  if (window.__TAURI__) {
    // Wait for the window object to be available if needed, though usually it is if __TAURI__ is there
    appWindow = window.__TAURI__.window.getCurrentWindow();
    invoke = window.__TAURI__.core.invoke;
  } else {
    console.warn("Tauri API not found. Running in browser mode?");
  }
}

let welcomeView;
let editorView;

async function initApp() {
  const appContainer = document.getElementById("app-container");

  // Initialize Tauri globals here, safely
  await initTauri();

  try {
    welcomeView = await loadView("welcome");
    editorView = await loadView("editor");

    // FIX: white flash for some OS WebView Initialization Lag
    if (appWindow) {
      await appWindow.show();
    }

    // Clear the loading text (only after success)
    const loader = appContainer.querySelector("h1");
    if (loader) loader.remove();

    // Start the transition timer
    setTimeout(() => {
      startApp();
    }, 3000);
  } catch (error) {

    // FIX: white flash for some OS WebView Initialization Lag
    if (appWindow) {
      await appWindow.show();
    }
    console.error("Failed to load views:", error);

    // Put the error on screen for the user
    if (appContainer) {
      appContainer.innerHTML = `<h2 style="color: red; text-align: center; margin-top: 20vh;">Error: ${error.message}</h2>`;
    }
  }
}

async function startApp() {
  console.log("Starting session...");

  // Fix: Remove leading whitespace text nodes in editor content
  cleanEditorContent();

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
