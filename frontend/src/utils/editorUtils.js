/**
 * Removes leading whitespace text nodes from the editor content.
 * This prevents the cursor from starting above the first element due to 'pre-wrap' logic.
 */
export function cleanEditorContent() {
    const editorContent = document.querySelector('.editor-content');
    if (editorContent) {
        while (editorContent.firstChild &&
            editorContent.firstChild.nodeType === 3 &&
            !editorContent.firstChild.textContent.trim()) {
            editorContent.firstChild.remove();
        }
    }
}
