/**
 * Editor Controller
 * Handles editor view logic, file tree rendering, and file operations
 */

import { vaultState, fileSystemState, appState } from '../../utils/stateManager.js';
import {
    loadDirectory,
    selectFile,
    updateFileContent,
    forceSave,
    createFile,
    createFolder,
    deleteItem,
    toggleFolder,
    isFolderExpanded,
    getFileTree,
    getActiveFile,
    clearFileSystemState
} from '../../utils/fileSystem.js';

// DOM element references
let elements = {};

// Internal state
let newItemType = 'file'; // 'file' or 'folder'
let newItemParentPath = null;
let deleteTargetPath = null;

/**
 * Initialize the editor controller
 */
export function initEditorController() {
    cacheElements();
    bindEvents();
    bindStateListeners();
}

/**
 * Cache DOM element references
 */
function cacheElements() {
    elements = {
        // Header
        backToVaults: document.getElementById('back-to-vaults'),
        vaultName: document.getElementById('header-vault-name'),
        vaultPath: document.getElementById('header-vault-path'),
        currentFileName: document.getElementById('current-file-name'),
        saveIndicator: document.getElementById('save-indicator'),

        // File tree
        fileTree: document.getElementById('file-tree'),
        newFileBtn: document.getElementById('new-file-btn'),
        newFolderBtn: document.getElementById('new-folder-btn'),

        // Editor
        editorEmpty: document.getElementById('editor-empty'),
        editorContent: document.getElementById('editor-content'),

        // Outline
        outlineTree: document.getElementById('outline-tree'),

        // New item modal
        newItemModal: document.getElementById('new-item-modal'),
        newItemModalTitle: document.getElementById('new-item-modal-title'),
        newItemInput: document.getElementById('new-item-input'),
        newItemCreate: document.getElementById('new-item-create'),
        newItemCancel: document.getElementById('new-item-cancel'),

        // Delete modal
        deleteItemModal: document.getElementById('delete-item-modal'),
        deleteItemMessage: document.getElementById('delete-item-message'),
        deleteItemConfirm: document.getElementById('delete-item-confirm'),
        deleteItemCancel: document.getElementById('delete-item-cancel'),
    };
}

/**
 * Bind event listeners
 */
function bindEvents() {
    // Back to vaults
    elements.backToVaults?.addEventListener('click', handleBackToVaults);

    // New file/folder
    elements.newFileBtn?.addEventListener('click', () => showNewItemModal('file'));
    elements.newFolderBtn?.addEventListener('click', () => showNewItemModal('folder'));

    // New item modal
    elements.newItemModal?.addEventListener('click', (e) => {
        if (e.target === elements.newItemModal) hideNewItemModal();
    });
    elements.newItemInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleNewItemCreate();
        if (e.key === 'Escape') hideNewItemModal();
    });
    elements.newItemCreate?.addEventListener('click', handleNewItemCreate);
    elements.newItemCancel?.addEventListener('click', hideNewItemModal);

    // Delete modal
    elements.deleteItemModal?.addEventListener('click', (e) => {
        if (e.target === elements.deleteItemModal) hideDeleteModal();
    });
    elements.deleteItemConfirm?.addEventListener('click', handleDeleteConfirm);
    elements.deleteItemCancel?.addEventListener('click', hideDeleteModal);

    // Editor content changes
    elements.editorContent?.addEventListener('input', handleEditorInput);

    // Listen for file-selected event
    window.addEventListener('file-selected', (e) => {
        const { path, name, content } = e.detail;
        showEditor(content);
        updateCurrentFileName(name);
        renderFileTree();
    });

    // Listen for file-saved event
    window.addEventListener('file-saved', () => {
        updateSaveIndicator(false);
    });
}

/**
 * Bind state listeners
 */
function bindStateListeners() {
    // File system state changes
    fileSystemState.subscribe((state, prevState) => {
        if (state.unsavedChanges !== prevState.unsavedChanges) {
            updateSaveIndicator(state.unsavedChanges);
        }
    });
}

/**
 * Open a vault and load its contents
 * @param {Object} vault - Vault metadata
 */
export async function openVault(vault) {
    // Update header
    elements.vaultName.textContent = vault.name;
    elements.vaultPath.textContent = formatPath(vault.path);
    elements.vaultPath.title = vault.path;

    // Reset editor
    hideEditor();
    updateCurrentFileName('No file selected');
    updateSaveIndicator(false);

    // Load file tree
    try {
        await loadDirectory(vault.path);
        renderFileTree();

        // Auto-select first file if available
        const tree = getFileTree();
        const firstFile = findFirstFile(tree);
        if (firstFile) {
            await selectFile(firstFile.path, firstFile.name);
        }
    } catch (error) {
        console.error('Failed to load vault:', error);
    }
}

/**
 * Find first file in tree
 */
function findFirstFile(tree) {
    for (const item of tree) {
        if (!item.isDirectory) {
            return item;
        }
        if (item.children && item.children.length > 0) {
            const found = findFirstFile(item.children);
            if (found) return found;
        }
    }
    return null;
}

/**
 * Render file tree
 */
function renderFileTree() {
    const tree = getFileTree();
    const activeFile = getActiveFile();

    if (tree.length === 0) {
        elements.fileTree.innerHTML = '<div class="file-tree-empty">No files yet</div>';
        return;
    }

    elements.fileTree.innerHTML = renderTreeItems(tree, activeFile?.path);
    bindTreeEvents();
}

/**
 * Render tree items recursively
 */
function renderTreeItems(items, activePath) {
    return items.map(item => {
        if (item.isDirectory) {
            const isExpanded = isFolderExpanded(item.path);
            return `
                <div class="tree-folder" data-path="${escapeHtml(item.path)}">
                    <div class="tree-folder-header">
                        <svg class="tree-folder-chevron ${isExpanded ? 'expanded' : ''}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="m9 18 6-6-6-6"/>
                        </svg>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>
                        </svg>
                        <span class="tree-item-name">${escapeHtml(item.name)}</span>
                        <div class="tree-item-actions">
                            <button class="tree-item-action delete-btn" title="Delete">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M3 6h18"/>
                                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                    <div class="tree-folder-children ${isExpanded ? 'expanded' : ''}">
                        ${item.children && item.children.length > 0 ? renderTreeItems(item.children, activePath) : ''}
                    </div>
                </div>
            `;
        } else {
            const isActive = item.path === activePath;
            return `
                <div class="tree-item ${isActive ? 'active' : ''}" data-path="${escapeHtml(item.path)}" data-name="${escapeHtml(item.name)}">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>
                        <path d="M14 2v4a2 2 0 0 0 2 2h4"/>
                    </svg>
                    <span class="tree-item-name">${escapeHtml(item.name)}</span>
                    <div class="tree-item-actions">
                        <button class="tree-item-action delete-btn" title="Delete">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M3 6h18"/>
                                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                            </svg>
                        </button>
                    </div>
                </div>
            `;
        }
    }).join('');
}

/**
 * Bind events to tree items
 */
function bindTreeEvents() {
    // File click
    elements.fileTree.querySelectorAll('.tree-item').forEach(item => {
        item.addEventListener('click', async (e) => {
            if (e.target.closest('.tree-item-action')) return;

            const path = item.dataset.path;
            const name = item.dataset.name;
            await selectFile(path, name);
        });

        // Delete button
        item.querySelector('.delete-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            showDeleteModal(item.dataset.path, item.dataset.name);
        });
    });

    // Folder click
    elements.fileTree.querySelectorAll('.tree-folder').forEach(folder => {
        const header = folder.querySelector('.tree-folder-header');
        const path = folder.dataset.path;

        header.addEventListener('click', (e) => {
            if (e.target.closest('.tree-item-action')) return;

            toggleFolder(path);
            renderFileTree();
        });

        // Delete button
        header.querySelector('.delete-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const name = header.querySelector('.tree-item-name').textContent;
            showDeleteModal(path, name);
        });
    });
}

/**
 * Handle back to vaults button
 */
async function handleBackToVaults() {
    // Save current file if needed
    await forceSave();

    // Clear state
    clearFileSystemState();
    vaultState.setState({ activeVault: null });

    // Navigate to vault selector
    appState.setState({ currentView: 'vault' });
    window.dispatchEvent(new CustomEvent('navigate-to-vault'));
}

/**
 * Show new item modal
 */
function showNewItemModal(type) {
    newItemType = type;
    newItemParentPath = vaultState.getState().activeVault?.path;

    elements.newItemModalTitle.textContent = type === 'file' ? 'New file' : 'New folder';
    elements.newItemInput.placeholder = type === 'file' ? 'filename.md' : 'folder name';
    elements.newItemInput.value = '';
    elements.newItemModal.style.display = 'flex';
    elements.newItemInput.focus();
}

/**
 * Hide new item modal
 */
function hideNewItemModal() {
    elements.newItemModal.style.display = 'none';
    newItemType = 'file';
    newItemParentPath = null;
}

/**
 * Handle new item creation
 */
async function handleNewItemCreate() {
    const name = elements.newItemInput.value.trim();
    if (!name || !newItemParentPath) return;

    elements.newItemCreate.disabled = true;
    elements.newItemCreate.textContent = 'Creating...';

    try {
        if (newItemType === 'file') {
            await createFile(newItemParentPath, name);
        } else {
            await createFolder(newItemParentPath, name);
        }
        hideNewItemModal();
        renderFileTree();
    } catch (error) {
        console.error('Failed to create item:', error);
    } finally {
        elements.newItemCreate.disabled = false;
        elements.newItemCreate.textContent = 'Create';
    }
}

/**
 * Show delete confirmation modal
 */
function showDeleteModal(path, name) {
    deleteTargetPath = path;
    elements.deleteItemMessage.textContent = `Are you sure you want to delete "${name}"?`;
    elements.deleteItemModal.style.display = 'flex';
}

/**
 * Hide delete modal
 */
function hideDeleteModal() {
    elements.deleteItemModal.style.display = 'none';
    deleteTargetPath = null;
}

/**
 * Handle delete confirmation
 */
async function handleDeleteConfirm() {
    if (!deleteTargetPath) return;

    elements.deleteItemConfirm.disabled = true;
    elements.deleteItemConfirm.textContent = 'Deleting...';

    try {
        await deleteItem(deleteTargetPath);
        hideDeleteModal();
        renderFileTree();

        // If we deleted the active file, show empty state
        const activeFile = getActiveFile();
        if (!activeFile) {
            hideEditor();
            updateCurrentFileName('No file selected');
        }
    } catch (error) {
        console.error('Failed to delete item:', error);
    } finally {
        elements.deleteItemConfirm.disabled = false;
        elements.deleteItemConfirm.textContent = 'Delete';
    }
}

/**
 * Handle editor input
 */
function handleEditorInput() {
    const content = elements.editorContent.innerText;
    updateFileContent(content);
}

/**
 * Show editor with content
 */
function showEditor(content) {
    elements.editorEmpty.style.display = 'none';
    elements.editorContent.style.display = 'block';
    elements.editorContent.innerText = content;
}

/**
 * Hide editor and show empty state
 */
function hideEditor() {
    elements.editorEmpty.style.display = 'flex';
    elements.editorContent.style.display = 'none';
    elements.editorContent.innerText = '';
}

/**
 * Update current file name in header
 */
function updateCurrentFileName(name) {
    elements.currentFileName.textContent = name;
}

/**
 * Update save indicator
 */
function updateSaveIndicator(unsaved) {
    const savedEl = elements.saveIndicator.querySelector('.saved');
    const unsavedEl = elements.saveIndicator.querySelector('.unsaved');

    if (unsaved) {
        savedEl.style.display = 'none';
        unsavedEl.style.display = 'inline';
    } else {
        savedEl.style.display = 'inline';
        unsavedEl.style.display = 'none';
    }
}

// Helper functions

function formatPath(path) {
    const segments = path.split('/').filter(Boolean);
    if (segments.length <= 2) return path;
    return '.../' + segments.slice(-2).join('/');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
