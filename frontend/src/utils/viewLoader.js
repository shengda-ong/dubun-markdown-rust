/**
 * Dynamically loads a view (HTML + CSS) into the app container
 * @param {string} viewName - The name of the view (e.g., 'welcome', 'editor')
 * @returns {Promise<HTMLElement>} The injected view element
 */
export async function loadView(viewName) {
    const appContainer = document.getElementById("app-container");
    if (!appContainer) {
        throw new Error("Critical: #app-container not found in DOM.");
    }

    try {
        // 1. Fetch HTML
        const response = await fetch(`views/${viewName}.html`);
        if (!response.ok) {
            throw new Error(`Failed to fetch view '${viewName}': Status ${response.status} ${response.statusText}`);
        }
        const html = await response.text();

        // 2. Create a Wrapper for easier handling
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;

        // Find the actual view element (skip injected scripts/styles)
        const viewElement = Array.from(tempDiv.children).find(el =>
            el.tagName !== 'SCRIPT' &&
            el.tagName !== 'STYLE' &&
            el.className.includes('view')
        );

        // Check if we actually got an element
        if (!viewElement) {
            console.warn("Available children:", Array.from(tempDiv.children).map(c => c.tagName));
            throw new Error(`View '${viewName}' parsed to empty/invalid HTML. Content: ${html.substring(0, 50)}...`);
        }

        // 3. Inject into Container
        appContainer.appendChild(viewElement);
        console.log(`Injected ${viewName} into DOM`);

        // 4. Load CSS (if not already loaded)
        if (!document.querySelector(`link[href="views/${viewName}.css"]`)) {
            const link = document.createElement("link");
            link.rel = "stylesheet";
            link.href = `views/${viewName}.css`;
            document.head.appendChild(link);
        }

        return viewElement;
    } catch (err) {
        console.error(`Error loading view ${viewName}:`, err);
        throw err; // Re-throw to be caught by initApp
    }
}
