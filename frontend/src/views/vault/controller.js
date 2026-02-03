/**
 * Vault Controller
 *
 * Handles vault view logic and interactions with proper operation handling.
 * Uses operation queue to prevent race conditions and sync service to
 * coordinate with other controllers.
 *
 * @module vaultController
 */

import { vaultApi, dialogApi } from '../../utils/tauriApi.js';
import { vaultState, appState, persistLastVaultId, clearVaultCache } from '../../utils/stateManager.js';
import { operationStore, OperationType } from '../../utils/core/operationStore.js';
import { vaultQueue } from '../../utils/core/operationQueue.js';
import { syncService } from '../../utils/core/syncService.js';

// ============================================================================
// State
// ============================================================================

/** @type {Object} Cached DOM element references */
let elements = {};

/** @type {string|null} Custom vault storage path */
let customPath = null;

/** @type {string|null} ID of vault targeted for deletion */
let deleteTargetVaultId = null;

/** @type {boolean} Whether delete target is a broken vault */
let deleteTargetIsBroken = false;

/** @type {string|null} App data directory path */
let appDataDir = null;

/** @type {number|null} Toast auto-hide timeout */
let toastTimeout = null;

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize the vault controller
 */
export async function initVaultController() {
    cacheElements();
    bindEvents();
    await loadVaults();
}

/**
 * Cache DOM element references for performance
 */
function cacheElements() {
    elements = {
        // Toast notification
        toast: document.getElementById('vault-toast'),
        toastMessage: document.getElementById('vault-toast-message'),

        // Create form
        createForm: document.getElementById('vault-create-form'),
        nameInput: document.getElementById('vault-name-input'),
        storagePath: document.getElementById('vault-storage-path'),
        chooseFolder: document.getElementById('vault-choose-folder'),
        chooseFolderText: document.getElementById('vault-choose-folder-text'),
        storageReset: document.getElementById('vault-storage-reset'),
        createBtn: document.getElementById('vault-create-btn'),
        cancelBtn: document.getElementById('vault-cancel-btn'),

        // Vault list
        listSection: document.getElementById('vault-list-section'),
        list: document.getElementById('vault-list'),
        newBtn: document.getElementById('vault-new-btn'),

        // Empty state
        empty: document.getElementById('vault-empty'),
        emptyCreateBtn: document.getElementById('vault-empty-create-btn'),

        // Delete modal
        deleteModal: document.getElementById('vault-delete-modal'),
        deleteModalTitle: document.getElementById('vault-delete-modal-title'),
        deleteModalMessage: document.getElementById('vault-delete-modal-message'),
        modalOptions: document.getElementById('vault-modal-options'),
        deleteKeep: document.getElementById('vault-delete-keep'),
        deleteFiles: document.getElementById('vault-delete-files'),
        deleteCancel: document.getElementById('vault-delete-cancel'),
    };
}

/**
 * Bind event listeners
 */
function bindEvents() {
    // Create form
    elements.nameInput?.addEventListener('input', handleNameInput);
    elements.nameInput?.addEventListener('keydown', handleNameKeydown);
    elements.chooseFolder?.addEventListener('click', handleChooseFolder);
    elements.storageReset?.addEventListener('click', handleStorageReset);
    elements.createBtn?.addEventListener('click', handleCreate);
    elements.cancelBtn?.addEventListener('click', hideCreateForm);

    // New vault buttons
    elements.newBtn?.addEventListener('click', showCreateForm);
    elements.emptyCreateBtn?.addEventListener('click', showCreateForm);

    // Delete modal - click outside to close (only if not in progress)
    elements.deleteModal?.addEventListener('click', (e) => {
        if (e.target === elements.deleteModal) {
            // Only allow closing if no operation in progress
            if (!operationStore.isOperationInProgress(OperationType.VAULT_DELETE)) {
                hideDeleteModal();
            }
        }
    });
    elements.deleteKeep?.addEventListener('click', () => handleDelete(false));
    elements.deleteFiles?.addEventListener('click', () => handleDelete(true));
    elements.deleteCancel?.addEventListener('click', () => {
        // Only allow closing if no operation in progress
        if (!operationStore.isOperationInProgress(OperationType.VAULT_DELETE)) {
            hideDeleteModal();
        }
    });
}

// ============================================================================
// Vault Loading
// ============================================================================

/**
 * Load vaults from backend
 */
async function loadVaults() {
    vaultState.setState({ isLoading: true, error: null });

    try {
        // Load app data directory and vaults in parallel for faster startup
        const [appDataDirResult, registry] = await Promise.all([
            vaultApi.getAppDataDir(),
            vaultApi.listVaults()
        ]);
        appDataDir = appDataDirResult;
        vaultState.setState({
            vaults: registry.vaults || [],
            lastVaultId: registry.lastVaultId,
            isLoading: false
        });

        renderVaultList();
    } catch (error) {
        console.error('Failed to load vaults:', error);
        vaultState.setState({ error: error.message || 'Failed to load vaults', isLoading: false });
        showToast(error.message || 'Failed to load vaults', 'error');
    }
}

// ============================================================================
// Vault List Rendering
// ============================================================================

/**
 * Render the vault list
 */
function renderVaultList() {
    const { vaults } = vaultState.getState();
    const isCreating = elements.createForm?.style.display !== 'none';

    if (vaults.length === 0) {
        elements.listSection.style.display = 'none';
        elements.empty.style.display = isCreating ? 'none' : 'block';
    } else {
        elements.empty.style.display = 'none';
        elements.listSection.style.display = 'block';

        // Hide new button if create form is visible
        if (elements.newBtn) {
            elements.newBtn.style.display = isCreating ? 'none' : 'inline-flex';
        }

        // Render vault cards
        elements.list.innerHTML = vaults.map((vault, index) => createVaultCardHTML(vault, index)).join('');

        // Bind click events to cards
        elements.list.querySelectorAll('.vault-card').forEach(card => {
            const vaultId = card.dataset.vaultId;
            const isBroken = card.classList.contains('broken');

            card.addEventListener('click', (e) => {
                // Don't trigger if clicking delete button
                if (e.target.closest('.vault-delete-btn')) return;

                if (isBroken) {
                    showDeleteModal(vaultId, true);
                } else {
                    openVault(vaultId);
                }
            });

            // Delete button
            const deleteBtn = card.querySelector('.vault-delete-btn');
            deleteBtn?.addEventListener('click', (e) => {
                e.stopPropagation();
                showDeleteModal(vaultId, isBroken);
            });
        });
    }
}

/**
 * Create HTML for a vault card
 * @param {Object} vault - Vault metadata
 * @param {number} index - Card index for animation delay
 * @returns {string} HTML string
 */
function createVaultCardHTML(vault, index) {
    const isBroken = vault.status && vault.status !== 'valid';
    const isMissing = vault.status === 'missing';
    const initials = getInitials(vault.name);
    const avatarColor = getAvatarColor(vault.name);
    const formattedDate = formatDate(vault.lastOpened);

    return `
        <div class="vault-card ${isBroken ? 'broken' : ''}"
             data-vault-id="${vault.id}"
             style="animation-delay: ${150 + index * 50}ms">
            <div class="vault-card-content">
                ${isBroken ? `
                    <div class="vault-avatar broken">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>
                            <path d="m9.5 10.5 5 5"/>
                            <path d="m14.5 10.5-5 5"/>
                        </svg>
                    </div>
                ` : `
                    <div class="vault-avatar" style="background: ${avatarColor.bg}; color: ${avatarColor.text};">
                        ${initials}
                    </div>
                `}
                <div class="vault-info">
                    <div class="vault-name">${escapeHtml(vault.name)}</div>
                    ${isBroken ? `
                        <div class="vault-meta broken">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
                                <path d="M12 9v4"/>
                                <path d="M12 17h.01"/>
                            </svg>
                            <span>${isMissing ? 'Folder not found' : 'Cannot access folder'}</span>
                        </div>
                    ` : formattedDate ? `
                        <div class="vault-meta">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="12" r="10"/>
                                <polyline points="12 6 12 12 16 14"/>
                            </svg>
                            <span>${formattedDate}</span>
                        </div>
                    ` : `
                        <div class="vault-meta">
                            <span>Never opened</span>
                        </div>
                    `}
                </div>
                <button class="vault-delete-btn" title="${isBroken ? 'Remove broken vault' : 'Delete vault'}">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M3 6h18"/>
                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                        <line x1="10" x2="10" y1="11" y2="17"/>
                        <line x1="14" x2="14" y1="11" y2="17"/>
                    </svg>
                </button>
            </div>
        </div>
    `;
}

// ============================================================================
// Vault Operations
// ============================================================================

/**
 * Open a vault
 * @param {string} vaultId - Vault ID to open
 */
async function openVault(vaultId) {
    // Check if vault is busy
    if (vaultQueue.isVaultBusy(vaultId)) {
        showToast('This vault is currently being processed', 'warning');
        return;
    }

    try {
        await vaultQueue.open(vaultId, async () => {
            const vault = await vaultApi.openVault(vaultId);
            vaultState.setState({ activeVault: vault });
            persistLastVaultId(vaultId);

            // Notify sync service
            syncService.handleVaultOpened(vaultId);

            // Navigate to editor
            appState.setState({ currentView: 'editor' });

            // Dispatch event for main.js to handle navigation
            window.dispatchEvent(new CustomEvent('vault-opened', { detail: vault }));
        });
    } catch (error) {
        console.error('Failed to open vault:', error);
        showToast(error.message || 'Failed to open vault', 'error');
    }
}

// ============================================================================
// Create Form
// ============================================================================

/**
 * Show create form
 */
function showCreateForm() {
    customPath = null;
    updateStoragePath();
    elements.createForm.style.display = 'block';
    elements.nameInput.value = '';
    elements.nameInput.disabled = false;
    elements.createBtn.disabled = true;
    elements.createBtn.textContent = 'Create';
    elements.nameInput.focus();

    // Hide empty state and new button
    elements.empty.style.display = 'none';
    if (elements.newBtn) {
        elements.newBtn.style.display = 'none';
    }
}

/**
 * Hide create form
 */
function hideCreateForm() {
    customPath = null;
    elements.createForm.style.display = 'none';
    elements.nameInput.value = '';
    renderVaultList();
}

/**
 * Handle name input changes
 */
function handleNameInput() {
    const hasName = elements.nameInput.value.trim().length > 0;
    elements.createBtn.disabled = !hasName;
    updateStoragePath();
}

/**
 * Handle name input keydown
 * @param {KeyboardEvent} e
 */
function handleNameKeydown(e) {
    if (e.key === 'Enter' && !elements.createBtn.disabled) {
        handleCreate();
    } else if (e.key === 'Escape') {
        hideCreateForm();
    }
}

/**
 * Handle choose folder button click
 */
async function handleChooseFolder() {
    try {
        const path = await dialogApi.openFolderDialog();
        if (path) {
            customPath = path;
            updateStoragePath();
        }
    } catch (error) {
        console.error('Failed to open folder dialog:', error);
    }
}

/**
 * Handle storage reset button click
 */
function handleStorageReset() {
    customPath = null;
    updateStoragePath();
}

/**
 * Update storage path display
 */
function updateStoragePath() {
    const vaultName = elements.nameInput.value.trim() || 'vault-name';
    let displayPath;

    if (customPath) {
        displayPath = `${customPath}/${vaultName}`;
        elements.chooseFolderText.textContent = 'Change';
        elements.storageReset.style.display = 'block';
    } else if (appDataDir) {
        displayPath = `${appDataDir}/vaults/${vaultName}`;
        elements.chooseFolderText.textContent = 'Choose';
        elements.storageReset.style.display = 'none';
    } else {
        displayPath = 'Default location';
        elements.chooseFolderText.textContent = 'Choose';
        elements.storageReset.style.display = 'none';
    }

    elements.storagePath.textContent = formatPath(displayPath);
    elements.storagePath.title = displayPath;
}

/**
 * Handle create vault
 */
async function handleCreate() {
    const name = elements.nameInput.value.trim();
    if (!name) return;

    elements.nameInput.disabled = true;
    elements.createBtn.disabled = true;
    elements.createBtn.textContent = 'Creating...';

    const operationId = operationStore.startOperation(OperationType.VAULT_CREATE);

    try {
        await vaultQueue.create(async () => {
            let vault;
            if (customPath) {
                vault = await vaultApi.addExternalVault(customPath, name);
            } else {
                vault = await vaultApi.createVault(name);
            }

            operationStore.completeOperation(operationId);
            hideCreateForm();
            await loadVaults();

            // Open the newly created vault
            await openVault(vault.id);
        });
    } catch (error) {
        operationStore.failOperation(operationId, error);
        console.error('Failed to create vault:', error);
        showToast(error.message || 'Failed to create vault', 'error');
        elements.nameInput.disabled = false;
        elements.createBtn.disabled = false;
        elements.createBtn.textContent = 'Create';
    }
}

// ============================================================================
// Delete Modal
// ============================================================================

/**
 * Show delete modal
 * @param {string} vaultId - Vault ID to delete
 * @param {boolean} isBroken - Whether vault is broken
 */
function showDeleteModal(vaultId, isBroken = false) {
    // Don't show if another delete is in progress
    if (operationStore.isOperationInProgress(OperationType.VAULT_DELETE)) {
        showToast('Another deletion is in progress', 'warning');
        return;
    }

    deleteTargetVaultId = vaultId;
    deleteTargetIsBroken = isBroken;

    const vault = vaultState.getState().vaults.find(v => v.id === vaultId);
    if (!vault) return;

    const isMissing = vault.status === 'missing';

    if (isBroken) {
        elements.deleteModalTitle.textContent = `Remove "${vault.name}"?`;
        elements.deleteModalMessage.textContent = `This vault's folder ${isMissing ? 'no longer exists' : 'cannot be accessed'}. Remove it from your vault list?`;

        // Show only remove option for broken vaults
        elements.deleteKeep.querySelector('.option-title').textContent = 'Remove from list';
        elements.deleteKeep.querySelector('.option-desc').textContent = 'This only removes the vault entry, not any files';
        elements.deleteKeep.classList.remove('keep');
        elements.deleteKeep.classList.add('delete');
        elements.deleteFiles.style.display = 'none';
    } else {
        elements.deleteModalTitle.textContent = `Delete "${vault.name}"?`;
        elements.deleteModalMessage.textContent = 'How would you like to remove this vault?';

        // Show both options for valid vaults
        elements.deleteKeep.querySelector('.option-title').textContent = 'Remove from Dubun';
        elements.deleteKeep.querySelector('.option-desc').textContent = 'Keep files on disk';
        elements.deleteKeep.classList.add('keep');
        elements.deleteKeep.classList.remove('delete');
        elements.deleteFiles.style.display = 'block';
    }

    // Enable all buttons
    setDeleteModalButtonsEnabled(true);
    elements.deleteModal.style.display = 'flex';
}

/**
 * Hide delete modal
 */
function hideDeleteModal() {
    elements.deleteModal.style.display = 'none';
    deleteTargetVaultId = null;
    deleteTargetIsBroken = false;
}

/**
 * Enable/disable delete modal buttons
 * @param {boolean} enabled
 */
function setDeleteModalButtonsEnabled(enabled) {
    const buttons = elements.modalOptions?.querySelectorAll('button');
    buttons?.forEach(btn => btn.disabled = !enabled);
    if (elements.deleteCancel) {
        elements.deleteCancel.disabled = !enabled;
    }
}

/**
 * Handle delete vault - FIXED: No race condition
 *
 * This is the critical fix: modal stays open until operation completes,
 * and uses operation queue to prevent concurrent deletes.
 *
 * @param {boolean} deleteFiles - Whether to delete files
 */
async function handleDelete(deleteFiles) {
    if (!deleteTargetVaultId) return;

    // Get vault info for UI feedback
    const vault = vaultState.getState().vaults.find(v => v.id === deleteTargetVaultId);
    const vaultName = vault?.name || 'Vault';
    const vaultId = deleteTargetVaultId;
    const isBroken = deleteTargetIsBroken;

    // Disable buttons to prevent double-click
    setDeleteModalButtonsEnabled(false);

    // Start tracking operation - DO NOT close modal yet
    const operationId = operationStore.startOperation(OperationType.VAULT_DELETE, {
        resourceId: vaultId,
        metadata: { vaultName, deleteFiles }
    });

    // Update modal to show progress
    elements.deleteModalTitle.textContent = 'Deleting...';
    elements.deleteModalMessage.textContent = `Removing "${vaultName}"...`;

    try {
        // CRITICAL: Ensure any unsaved changes are saved first
        const prepResult = await syncService.prepareForVaultDeletion(vaultId);

        if (!prepResult.ready && !prepResult.requiresConfirmation) {
            throw prepResult.error;
        }

        if (prepResult.requiresConfirmation) {
            // Show warning but continue anyway for now
            // In a more sophisticated implementation, this would prompt the user
            console.warn('Unable to save changes before deletion:', prepResult.message);
        }

        // Use queue to prevent concurrent deletes
        await vaultQueue.delete(vaultId, async () => {
            if (isBroken) {
                await vaultApi.removeBrokenVault(vaultId);
            } else {
                await vaultApi.deleteVault(vaultId, deleteFiles);
            }
        });

        // Operation succeeded - NOW close modal
        operationStore.completeOperation(operationId);

        // Notify sync service to clean up editor state if needed
        syncService.handleVaultDeleted(vaultId);

        // Clear localStorage cache for this vault
        clearVaultCache(vaultId);

        hideDeleteModal();
        await loadVaults();
        showToast(`"${vaultName}" removed`, 'success');

    } catch (error) {
        // Operation failed - show error in modal, keep it open
        operationStore.failOperation(operationId, error);

        elements.deleteModalTitle.textContent = 'Delete Failed';
        elements.deleteModalMessage.textContent = error.message || 'Failed to delete vault';

        // Re-enable cancel button so user can dismiss
        if (elements.deleteCancel) {
            elements.deleteCancel.disabled = false;
        }

        // Refresh vault list to show current state
        await loadVaults();
    }
}

// ============================================================================
// Toast Notifications
// ============================================================================

/**
 * Show toast notification
 * @param {string} message - Message to display
 * @param {'success'|'error'|'warning'} type - Toast type
 */
function showToast(message, type = 'success') {
    // Clear any existing timeout
    if (toastTimeout) {
        clearTimeout(toastTimeout);
    }

    elements.toastMessage.textContent = message;
    elements.toast.className = `vault-toast ${type}`;
    elements.toast.style.display = 'block';

    // Trigger reflow for animation
    elements.toast.offsetHeight;
    elements.toast.classList.add('visible');

    // Auto-hide after 3 seconds
    toastTimeout = setTimeout(() => {
        elements.toast.classList.remove('visible');
        setTimeout(() => {
            elements.toast.style.display = 'none';
        }, 200);
    }, 3000);
}

/**
 * Hide toast notification
 */
function hideToast() {
    if (toastTimeout) {
        clearTimeout(toastTimeout);
    }
    elements.toast.classList.remove('visible');
    elements.toast.style.display = 'none';
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get initials from vault name
 * @param {string} name
 * @returns {string}
 */
function getInitials(name) {
    return name
        .split(' ')
        .map(w => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
}

/**
 * Get avatar color based on vault name
 * @param {string} name
 * @returns {{bg: string, text: string}}
 */
function getAvatarColor(name) {
    const colors = [
        { bg: 'rgba(59, 130, 246, 0.1)', text: '#3b82f6' },
        { bg: 'rgba(16, 185, 129, 0.1)', text: '#10b981' },
        { bg: 'rgba(168, 85, 247, 0.1)', text: '#a855f7' },
        { bg: 'rgba(245, 158, 11, 0.1)', text: '#f59e0b' },
        { bg: 'rgba(239, 68, 68, 0.1)', text: '#ef4444' },
        { bg: 'rgba(6, 182, 212, 0.1)', text: '#06b6d4' },
    ];
    const index = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
    return colors[index];
}

/**
 * Format date for display
 * @param {string|null} dateStr - ISO date string
 * @returns {string|null}
 */
function formatDate(dateStr) {
    if (!dateStr) return null;
    try {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;

        return date.toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
        });
    } catch {
        return null;
    }
}

/**
 * Format path for display (truncate long paths)
 * @param {string} path
 * @returns {string}
 */
function formatPath(path) {
    const segments = path.split('/').filter(Boolean);
    if (segments.length <= 3) return path;
    return '.../' + segments.slice(-3).join('/');
}

/**
 * Escape HTML to prevent XSS
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================================
// Health Check Modal
// ============================================================================

/** @type {Object} Cached health modal element references */
let healthElements = {};

/**
 * Cache health modal DOM elements
 */
function cacheHealthElements() {
    healthElements = {
        modal: document.getElementById('vault-health-modal'),
        title: document.getElementById('vault-health-title'),
        message: document.getElementById('vault-health-message'),
        summary: document.getElementById('vault-health-summary'),
        countHealthy: document.getElementById('health-count-healthy'),
        countBroken: document.getElementById('health-count-broken'),
        list: document.getElementById('vault-health-list'),
        progress: document.getElementById('vault-health-progress'),
        actions: document.getElementById('vault-health-actions'),
        cleanupBtn: document.getElementById('vault-health-cleanup'),
        dismissBtn: document.getElementById('vault-health-dismiss'),
    };
}

/**
 * Run health check on all vaults
 * @returns {Promise<{healthy: Array, broken: Array}>}
 */
export async function runHealthCheck() {
    // Ensure health elements are cached
    if (!healthElements.modal) {
        cacheHealthElements();
    }

    try {
        const result = await vaultApi.checkVaultHealth();
        return result;
    } catch (error) {
        console.error('Health check failed:', error);
        throw error;
    }
}

/**
 * Show health check modal with results
 * @param {Object} healthResult - Result from runHealthCheck
 */
export function showHealthCheckModal(healthResult) {
    // Ensure health elements are cached
    if (!healthElements.modal) {
        cacheHealthElements();
    }

    const { healthy, broken } = healthResult;
    const hasBroken = broken && broken.length > 0;

    // Update icon based on health status
    const iconEl = healthElements.modal.querySelector('.vault-modal-icon');
    if (hasBroken) {
        iconEl.classList.add('warning');
        iconEl.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
                <path d="M12 9v4"/>
                <path d="M12 17h.01"/>
            </svg>
        `;
    } else {
        iconEl.classList.remove('warning');
        iconEl.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
                <path d="m9 12 2 2 4-4"/>
            </svg>
        `;
    }

    // Update title and message
    if (hasBroken) {
        healthElements.title.textContent = 'Vault Issues Found';
        healthElements.message.textContent = `${broken.length} vault${broken.length > 1 ? 's' : ''} can no longer be accessed. Would you like to clean up the broken entries?`;
    } else {
        healthElements.title.textContent = 'All Vaults Healthy';
        healthElements.message.textContent = 'All your vaults are accessible and working correctly.';
    }

    // Update summary counts
    healthElements.countHealthy.textContent = healthy?.length || 0;
    healthElements.countBroken.textContent = broken?.length || 0;
    healthElements.summary.style.display = 'flex';

    // Render broken vaults list
    if (hasBroken) {
        healthElements.list.innerHTML = broken.map(vault => `
            <div class="vault-health-item">
                <div class="vault-health-item-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>
                        <path d="m9.5 10.5 5 5"/>
                        <path d="m14.5 10.5-5 5"/>
                    </svg>
                </div>
                <div class="vault-health-item-info">
                    <div class="vault-health-item-name">${escapeHtml(vault.name)}</div>
                    <div class="vault-health-item-path">${escapeHtml(vault.path)}</div>
                </div>
            </div>
        `).join('');
        healthElements.list.style.display = 'block';
    } else {
        healthElements.list.style.display = 'none';
    }

    // Hide progress, show actions
    healthElements.progress.style.display = 'none';
    healthElements.actions.style.display = 'flex';

    // Show/hide cleanup button based on broken count
    if (healthElements.cleanupBtn) {
        healthElements.cleanupBtn.style.display = hasBroken ? 'inline-flex' : 'none';
    }

    // Bind event listeners
    healthElements.cleanupBtn?.addEventListener('click', handleHealthCleanup, { once: true });
    healthElements.dismissBtn?.addEventListener('click', hideHealthModal, { once: true });

    // Show modal
    healthElements.modal.style.display = 'flex';
}

/**
 * Handle cleanup button click
 */
async function handleHealthCleanup() {
    // Disable button
    if (healthElements.cleanupBtn) {
        healthElements.cleanupBtn.disabled = true;
        healthElements.cleanupBtn.innerHTML = `
            <div class="progress-spinner" style="width: 16px; height: 16px;"></div>
            <span>Cleaning up...</span>
        `;
    }

    try {
        const result = await vaultApi.cleanupAllBrokenVaults();

        // Clear localStorage cache for all cleaned vaults
        if (result.cleanedIds && result.cleanedIds.length > 0) {
            result.cleanedIds.forEach(id => clearVaultCache(id));
        }

        // Update UI
        healthElements.title.textContent = 'Cleanup Complete';
        healthElements.message.textContent = `Removed ${result.cleaned} broken vault${result.cleaned !== 1 ? 's' : ''} from registry.`;
        healthElements.list.style.display = 'none';
        healthElements.countBroken.textContent = '0';

        if (healthElements.cleanupBtn) {
            healthElements.cleanupBtn.style.display = 'none';
        }

        // Refresh vault list
        await loadVaults();

    } catch (error) {
        console.error('Cleanup failed:', error);
        healthElements.message.textContent = `Cleanup failed: ${error.message}`;

        if (healthElements.cleanupBtn) {
            healthElements.cleanupBtn.disabled = false;
            healthElements.cleanupBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 6h18"/>
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                </svg>
                <span>Retry cleanup</span>
            `;
        }
    }
}

/**
 * Hide health check modal
 */
function hideHealthModal() {
    if (healthElements.modal) {
        healthElements.modal.style.display = 'none';
    }
}

/**
 * Show health modal in loading state
 */
export function showHealthModalLoading() {
    // Ensure health elements are cached
    if (!healthElements.modal) {
        cacheHealthElements();
    }

    healthElements.title.textContent = 'Vault Health Check';
    healthElements.message.textContent = 'Checking your vaults...';
    healthElements.summary.style.display = 'none';
    healthElements.list.style.display = 'none';
    healthElements.progress.style.display = 'flex';
    healthElements.actions.style.display = 'none';

    healthElements.modal.style.display = 'flex';
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Refresh vault list (called when navigating back to vault view)
 */
export async function refreshVaultList() {
    await loadVaults();
}
