/**
 * File System Controller
 * Handles file tree management, file operations, and auto-save
 *
 * SAFETY FEATURES:
 * - Max recursion depth to prevent stack overflow
 * - Max entries per level to prevent memory exhaustion
 * - Load timeout to prevent infinite hangs
 * - Cycle detection via canonical path tracking
 * - Operation queue integration for safe concurrent access
 */

import { fileApi } from './tauriApi.js';
import { fileSystemState, vaultState, persistExpandedFolders, getPersistedExpandedFolders } from './stateManager.js';
import { operationStore, OperationType } from './core/operationStore.js';
import { fileQueue } from './core/operationQueue.js';

// ============================================================================
// CONFIGURATION - Safety limits to prevent resource exhaustion
// ============================================================================

const FILE_TREE_CONFIG = Object.freeze({
    MAX_DEPTH: 10,                    // Prevent stack overflow from deep nesting
    MAX_ENTRIES_PER_LEVEL: 500,       // Prevent memory issues from huge directories
    LOAD_TIMEOUT_MS: 5000,            // Prevent infinite hangs
    MAX_TOTAL_NODES: 10000,           // Global cap on total nodes in tree
});

// Auto-save debounce timer
let saveTimeout = null;
const AUTOSAVE_DELAY = 1000; // 1 second

// ============================================================================
// FILE TREE LOADING WITH SAFETY LIMITS
// ============================================================================

/**
 * Load directory contents recursively to build file tree
 * @param {string} path - Directory path
 * @returns {Promise<Array>} File tree with nested children
 */
export async function loadDirectory(path) {
    fileSystemState.setState({ isLoading: true, error: null });

    const operationId = operationStore.startOperation(OperationType.FILE_TREE_LOAD, {
        path,
        maxDepth: FILE_TREE_CONFIG.MAX_DEPTH
    });

    try {
        // Create abort controller for timeout
        const abortController = new AbortController();
        const timeoutId = setTimeout(() => {
            abortController.abort();
        }, FILE_TREE_CONFIG.LOAD_TIMEOUT_MS);

        // Track visited paths to detect cycles
        const visitedPaths = new Set();
        let totalNodes = 0;

        const entries = await fileApi.listDirectory(path);
        const tree = await buildFileTreeSafe(entries, 0, visitedPaths, () => totalNodes++, abortController.signal);

        clearTimeout(timeoutId);

        // Restore expanded folders from localStorage
        const activeVault = vaultState.getState().activeVault;
        if (activeVault) {
            const expandedFolders = getPersistedExpandedFolders(activeVault.id);
            fileSystemState.setState({ expandedFolders });
        }

        fileSystemState.setState({ fileTree: tree, isLoading: false });
        operationStore.completeOperation(operationId, { nodeCount: totalNodes });
        return tree;
    } catch (error) {
        const errorMessage = error.name === 'AbortError'
            ? `File tree load timed out after ${FILE_TREE_CONFIG.LOAD_TIMEOUT_MS}ms`
            : error.message;

        console.error('Failed to load directory:', errorMessage);
        fileSystemState.setState({ error: errorMessage, isLoading: false });
        operationStore.failOperation(operationId, error);
        throw error;
    }
}

/**
 * Build file tree with safety limits
 * @param {Array} entries - Flat list of file entries
 * @param {number} depth - Current recursion depth
 * @param {Set} visitedPaths - Set of canonical paths already visited (cycle detection)
 * @param {Function} incrementNodeCount - Callback to track total nodes
 * @param {AbortSignal} signal - Abort signal for timeout
 * @returns {Promise<Array>} Nested file tree
 */
async function buildFileTreeSafe(entries, depth, visitedPaths, incrementNodeCount, signal) {
    // Safety check: Max depth reached
    if (depth >= FILE_TREE_CONFIG.MAX_DEPTH) {
        console.warn(`Max depth ${FILE_TREE_CONFIG.MAX_DEPTH} reached, truncating tree`);
        return [];
    }

    // Safety check: Timeout
    if (signal.aborted) {
        throw new DOMException('File tree load aborted', 'AbortError');
    }

    const tree = [];
    let entriesProcessed = 0;

    for (const entry of entries) {
        // Safety check: Max entries per level
        if (entriesProcessed >= FILE_TREE_CONFIG.MAX_ENTRIES_PER_LEVEL) {
            console.warn(`Max entries per level (${FILE_TREE_CONFIG.MAX_ENTRIES_PER_LEVEL}) reached at depth ${depth}`);
            tree.push({
                name: `... ${entries.length - entriesProcessed} more items`,
                path: null,
                isDirectory: false,
                isTruncated: true,
                children: []
            });
            break;
        }

        // Safety check: Global node limit
        incrementNodeCount();
        if (incrementNodeCount.count > FILE_TREE_CONFIG.MAX_TOTAL_NODES) {
            console.warn(`Max total nodes (${FILE_TREE_CONFIG.MAX_TOTAL_NODES}) reached`);
            break;
        }

        const node = {
            name: entry.name,
            path: entry.path,
            isDirectory: entry.isDirectory,
            children: []
        };

        // Recursively load directory contents with cycle detection
        if (entry.isDirectory) {
            // Get canonical path to detect symlink cycles
            let canonicalPath;
            try {
                canonicalPath = await fileApi.getCanonicalPath(entry.path);
            } catch {
                canonicalPath = entry.path; // Fallback to original path
            }

            // Cycle detection
            if (visitedPaths.has(canonicalPath)) {
                console.warn(`Cycle detected at ${entry.path} (canonical: ${canonicalPath})`);
                node.isCycle = true;
            } else {
                visitedPaths.add(canonicalPath);

                try {
                    const childEntries = await fileApi.listDirectory(entry.path);
                    node.children = await buildFileTreeSafe(
                        childEntries,
                        depth + 1,
                        visitedPaths,
                        incrementNodeCount,
                        signal
                    );
                } catch (error) {
                    console.error(`Failed to load directory ${entry.path}:`, error);
                    node.loadError = error.message;
                }
            }
        }

        tree.push(node);
        entriesProcessed++;
    }

    return tree;
}

/**
 * Refresh the file tree for current vault
 */
export async function refreshFileTree() {
    const activeVault = vaultState.getState().activeVault;
    if (activeVault) {
        await loadDirectory(activeVault.path);
    }
}

/**
 * Select and load a file
 * @param {string} path - File path
 * @param {string} name - File name
 */
export async function selectFile(path, name) {
    // Save current file if there are unsaved changes
    const { activeFile, unsavedChanges } = fileSystemState.getState();
    if (activeFile && unsavedChanges) {
        await saveFile(activeFile.path, activeFile.content);
    }

    try {
        const content = await fileApi.readFile(path);
        fileSystemState.setState({
            activeFile: { path, name, content },
            unsavedChanges: false
        });

        // Dispatch event for editor to update
        window.dispatchEvent(new CustomEvent('file-selected', {
            detail: { path, name, content }
        }));
    } catch (error) {
        console.error('Failed to read file:', error);
        fileSystemState.setState({ error: error.message });
    }
}

/**
 * Update active file content (triggers auto-save)
 * @param {string} content - New content
 */
export function updateFileContent(content) {
    const { activeFile } = fileSystemState.getState();
    if (!activeFile) return;

    fileSystemState.setState({
        activeFile: { ...activeFile, content },
        unsavedChanges: true
    });

    // Debounced auto-save
    if (saveTimeout) {
        clearTimeout(saveTimeout);
    }
    saveTimeout = setTimeout(async () => {
        await saveFile(activeFile.path, content);
    }, AUTOSAVE_DELAY);
}

/**
 * Save file to disk with operation tracking
 * @param {string} path - File path
 * @param {string} content - File content
 * @returns {Promise<boolean>} Success status
 */
export async function saveFile(path, content) {
    const operationId = operationStore.startOperation(OperationType.FILE_SAVE, {
        path,
        contentLength: content.length
    });

    try {
        // Use file queue to prevent concurrent writes to same file
        await fileQueue.save(path, async () => {
            await fileApi.writeFile(path, content);
        });

        fileSystemState.setState({ unsavedChanges: false });
        operationStore.completeOperation(operationId);

        // Dispatch save event
        window.dispatchEvent(new CustomEvent('file-saved', { detail: { path } }));
        return true;
    } catch (error) {
        console.error('Failed to save file:', error);
        fileSystemState.setState({ error: error.message });
        operationStore.failOperation(operationId, error);
        return false;
    }
}

/**
 * Force save current file immediately
 */
export async function forceSave() {
    if (saveTimeout) {
        clearTimeout(saveTimeout);
        saveTimeout = null;
    }

    const { activeFile, unsavedChanges } = fileSystemState.getState();
    if (activeFile && unsavedChanges) {
        await saveFile(activeFile.path, activeFile.content);
    }
}

/**
 * Create a new file
 * @param {string} parentPath - Parent directory path
 * @param {string} name - File name (with extension)
 * @returns {Promise<string>} Created file path
 */
export async function createFile(parentPath, name) {
    // Ensure .md extension
    const fileName = name.endsWith('.md') ? name : `${name}.md`;
    const filePath = `${parentPath}/${fileName}`;

    try {
        await fileApi.writeFile(filePath, `# ${name.replace('.md', '')}\n\n`);
        await refreshFileTree();

        // Select the new file
        await selectFile(filePath, fileName);

        return filePath;
    } catch (error) {
        console.error('Failed to create file:', error);
        fileSystemState.setState({ error: error.message });
        throw error;
    }
}

/**
 * Create a new folder
 * @param {string} parentPath - Parent directory path
 * @param {string} name - Folder name
 * @returns {Promise<string>} Created folder path
 */
export async function createFolder(parentPath, name) {
    const folderPath = `${parentPath}/${name}`;

    try {
        await fileApi.createDirectory(folderPath);
        await refreshFileTree();

        // Expand parent folder
        toggleFolder(parentPath, true);

        return folderPath;
    } catch (error) {
        console.error('Failed to create folder:', error);
        fileSystemState.setState({ error: error.message });
        throw error;
    }
}

/**
 * Delete a file or folder with operation tracking
 * @param {string} path - Path to delete
 */
export async function deleteItem(path) {
    const operationId = operationStore.startOperation(OperationType.FILE_DELETE, { path });

    try {
        // Use file queue to serialize delete operations
        await fileQueue.delete(path, async () => {
            // If deleting active file, clear it BEFORE deletion
            const { activeFile } = fileSystemState.getState();
            if (activeFile && activeFile.path === path) {
                // Cancel any pending auto-save for this file
                if (saveTimeout) {
                    clearTimeout(saveTimeout);
                    saveTimeout = null;
                }
                fileSystemState.setState({ activeFile: null, unsavedChanges: false });
            }

            await fileApi.deletePath(path);
        });

        await refreshFileTree();
        operationStore.completeOperation(operationId);
    } catch (error) {
        console.error('Failed to delete item:', error);
        fileSystemState.setState({ error: error.message });
        operationStore.failOperation(operationId, error);
        throw error;
    }
}

/**
 * Rename a file or folder
 * @param {string} oldPath - Current path
 * @param {string} newName - New name
 * @returns {Promise<string>} New path
 */
export async function renameItem(oldPath, newName) {
    const parentPath = oldPath.substring(0, oldPath.lastIndexOf('/'));
    const newPath = `${parentPath}/${newName}`;

    try {
        await fileApi.renamePath(oldPath, newPath);

        // Update active file if it was renamed
        const { activeFile } = fileSystemState.getState();
        if (activeFile && activeFile.path === oldPath) {
            fileSystemState.setState({
                activeFile: { ...activeFile, path: newPath, name: newName }
            });
        }

        await refreshFileTree();
        return newPath;
    } catch (error) {
        console.error('Failed to rename item:', error);
        fileSystemState.setState({ error: error.message });
        throw error;
    }
}

/**
 * Toggle folder expanded state
 * @param {string} path - Folder path
 * @param {boolean} expanded - Optional force state
 */
export function toggleFolder(path, expanded = null) {
    const { expandedFolders } = fileSystemState.getState();
    const newExpanded = new Set(expandedFolders);

    if (expanded === null) {
        // Toggle
        if (newExpanded.has(path)) {
            newExpanded.delete(path);
        } else {
            newExpanded.add(path);
        }
    } else if (expanded) {
        newExpanded.add(path);
    } else {
        newExpanded.delete(path);
    }

    fileSystemState.setState({ expandedFolders: newExpanded });

    // Persist to localStorage
    const activeVault = vaultState.getState().activeVault;
    if (activeVault) {
        persistExpandedFolders(activeVault.id, newExpanded);
    }
}

/**
 * Check if a folder is expanded
 * @param {string} path - Folder path
 * @returns {boolean}
 */
export function isFolderExpanded(path) {
    const { expandedFolders } = fileSystemState.getState();
    return expandedFolders.has(path);
}

/**
 * Get the current file tree
 * @returns {Array}
 */
export function getFileTree() {
    return fileSystemState.getState().fileTree;
}

/**
 * Get active file
 * @returns {Object|null}
 */
export function getActiveFile() {
    return fileSystemState.getState().activeFile;
}

/**
 * Clear file system state (when closing vault)
 */
export function clearFileSystemState() {
    if (saveTimeout) {
        clearTimeout(saveTimeout);
        saveTimeout = null;
    }

    fileSystemState.setState({
        fileTree: [],
        activeFile: null,
        expandedFolders: new Set(),
        unsavedChanges: false,
        isLoading: false,
        error: null
    });
}
