/**
 * Simple parser to convert markdown text to HTML for preview mode.
 * Currently supports: Bold, Italic. 
 * Expands to full markdown support in future phases.
 * @param {string} text 
 * @returns {string} HTML string
 */
export function parseMarkdown(text) {
    if (!text) return '<br>'; // Empty block needs height

    let html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // Bold (**text**)
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Italic (*text*)
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // Headers - usually blocks have types, but inline header syntax support:
    html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>');
    html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
    html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>');

    return html;
}
