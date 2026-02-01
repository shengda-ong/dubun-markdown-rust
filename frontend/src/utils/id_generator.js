/**
 * Generates a unique ID for blocks.
 * Uses crypto.randomUUID() if available (Node and modern Browsers),
 * falls back to a simple timestamp-random based string.
 * @returns {string} detailed unique id
 */
export function generateId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    // Fallback for environments where crypto.randomUUID might not be available
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}
