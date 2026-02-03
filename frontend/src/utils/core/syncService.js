/**
 * Sync Service
 *
 * Coordinates state between controllers to prevent data loss.
 * Handles cross-cutting concerns like ensuring saves before destructive operations,
 * cleaning up state when vaults are deleted, and blocking conflicting operations.
 *
 * Key features:
 * - Force save before vault operations that could cause data loss
 * - Clean up editor state when active vault is deleted
 * - Coordinate between vault and file system operations
 * - Provide conflict detection for UI feedback
 *
 * @module core/syncService
 */

import { fileSystemState, vaultState } from '../stateManager.js';
import { operationStore, OperationType } from './operationStore.js';

/**
 * @typedef {Object} UnsavedState
 * @property {boolean} hasUnsavedChanges - Whether there are pending changes
 * @property {string|null} activeFilePath - Path of file with unsaved changes
 * @property {string|null} vaultId - ID of vault containing the file
 * @property {string|null} vaultPath - Path of vault containing the file
 */

/**
 * @typedef {Object} ConflictCheckResult
 * @property {boolean} hasConflict - Whether a conflict exists
 * @property {string|null} reason - Description of the conflict
 * @property {string|null} suggestion - Suggested resolution
 */

class SyncService {
    constructor() {
        /** @type {Set<Function>} */
        this.listeners = new Set();

        /** @type {Map<string, Function>} - Registered save handlers by vault ID */
        this.saveHandlers = new Map();
    }

    /**
     * Register a save handler for a vault
     * Used by editor controller to provide save capability
     * @param {string} vaultId - Vault ID
     * @param {Function} handler - Async function that performs save
     */
    registerSaveHandler(vaultId, handler) {
        this.saveHandlers.set(vaultId, handler);
    }

    /**
     * Unregister a save handler
     * @param {string} vaultId
     */
    unregisterSaveHandler(vaultId) {
        this.saveHandlers.delete(vaultId);
    }

    /**
     * Get the current unsaved state
     * @returns {UnsavedState}
     */
    getUnsavedState() {
        const fsState = fileSystemState.getState();
        const vState = vaultState.getState();

        return {
            hasUnsavedChanges: fsState.unsavedChanges,
            activeFilePath: fsState.activeFile?.path || null,
            vaultId: vState.activeVault?.id || null,
            vaultPath: vState.activeVault?.path || null
        };
    }

    /**
     * Check if a file is within a specific vault
     * @param {string} filePath - File path to check
     * @param {string} vaultPath - Vault path to compare against
     * @returns {boolean}
     */
    isFileInVault(filePath, vaultPath) {
        if (!filePath || !vaultPath) return false;

        // Normalize paths for comparison
        const normalizedFile = filePath.replace(/\\/g, '/');
        const normalizedVault = vaultPath.replace(/\\/g, '/');

        return normalizedFile.startsWith(normalizedVault);
    }

    /**
     * Force save before a vault operation
     * Ensures no data is lost when vault is modified or deleted
     *
     * @param {string} vaultId - ID of vault being operated on
     * @returns {Promise<{saved: boolean, error: Error|null}>}
     */
    async ensureSavedBeforeVaultOperation(vaultId) {
        const state = this.getUnsavedState();

        // No unsaved changes - nothing to do
        if (!state.hasUnsavedChanges) {
            return { saved: true, error: null };
        }

        // Check if the unsaved changes are in the target vault
        if (state.vaultId !== vaultId) {
            // Changes are in a different vault - safe to proceed
            return { saved: true, error: null };
        }

        // Try to save using registered handler
        const saveHandler = this.saveHandlers.get(vaultId);
        if (saveHandler) {
            try {
                await saveHandler();
                return { saved: true, error: null };
            } catch (error) {
                console.error('[SyncService] Failed to save before vault operation:', error);
                return { saved: false, error };
            }
        }

        // No save handler registered - try using fileSystem module directly
        try {
            // Dynamic import to avoid circular dependency
            const { forceSave } = await import('../fileSystem.js');
            await forceSave();
            return { saved: true, error: null };
        } catch (error) {
            console.error('[SyncService] Failed to force save:', error);
            return { saved: false, error };
        }
    }

    /**
     * Handle vault deletion - clean up related state
     * Called after a vault is successfully deleted
     *
     * @param {string} vaultId - ID of deleted vault
     */
    handleVaultDeleted(vaultId) {
        const { activeVault } = vaultState.getState();

        // Check if deleted vault was the active vault
        if (activeVault?.id === vaultId) {
            console.debug('[SyncService] Active vault deleted, cleaning up state');

            // Clear file system state
            fileSystemState.setState({
                fileTree: [],
                activeFile: null,
                expandedFolders: new Set(),
                unsavedChanges: false,
                isLoading: false,
                error: null
            });

            // Clear vault state
            vaultState.setState({
                activeVault: null
            });

            // Unregister save handler
            this.unregisterSaveHandler(vaultId);

            // Dispatch navigation event
            window.dispatchEvent(new CustomEvent('navigate-to-vault', {
                detail: { reason: 'vault_deleted' }
            }));
        }
    }

    /**
     * Handle vault opened - set up sync for new vault
     *
     * @param {string} vaultId - ID of opened vault
     */
    handleVaultOpened(vaultId) {
        // Clear any previous vault's unsaved state
        const prevState = this.getUnsavedState();
        if (prevState.vaultId && prevState.vaultId !== vaultId) {
            this.unregisterSaveHandler(prevState.vaultId);
        }
    }

    /**
     * Check if a file operation would conflict with ongoing operations
     *
     * @param {string} filePath - Path of file being operated on
     * @returns {ConflictCheckResult}
     */
    checkFileOperationConflict(filePath) {
        // Check if vault delete is in progress
        if (operationStore.isOperationInProgress(OperationType.VAULT_DELETE)) {
            return {
                hasConflict: true,
                reason: 'A vault deletion is in progress',
                suggestion: 'Wait for the deletion to complete before performing file operations'
            };
        }

        // Check if file is locked by another operation
        if (operationStore.isResourceBusy(filePath)) {
            return {
                hasConflict: true,
                reason: 'This file is being modified by another operation',
                suggestion: 'Wait for the current operation to complete'
            };
        }

        return { hasConflict: false, reason: null, suggestion: null };
    }

    /**
     * Check if a vault operation would conflict with ongoing operations
     *
     * @param {string} vaultId - ID of vault being operated on
     * @param {OperationType} operationType - Type of operation being attempted
     * @returns {ConflictCheckResult}
     */
    checkVaultOperationConflict(vaultId, operationType) {
        // Check operation store for blocking operations
        const blockCheck = operationStore.checkBlocking(operationType, vaultId);

        if (blockCheck.blocked) {
            return {
                hasConflict: true,
                reason: blockCheck.reason,
                suggestion: 'Wait for the current operation to complete'
            };
        }

        // Check if trying to delete vault with unsaved changes
        if (operationType === OperationType.VAULT_DELETE) {
            const unsavedState = this.getUnsavedState();
            if (unsavedState.hasUnsavedChanges && unsavedState.vaultId === vaultId) {
                return {
                    hasConflict: true,
                    reason: 'The vault has unsaved changes',
                    suggestion: 'Save changes before deleting, or choose to discard them'
                };
            }
        }

        return { hasConflict: false, reason: null, suggestion: null };
    }

    /**
     * Prepare for vault deletion
     * Performs all pre-deletion checks and saves
     *
     * @param {string} vaultId - ID of vault to be deleted
     * @returns {Promise<{ready: boolean, error: Error|null, requiresConfirmation: boolean, message: string|null}>}
     */
    async prepareForVaultDeletion(vaultId) {
        // Check for conflicts
        const conflict = this.checkVaultOperationConflict(vaultId, OperationType.VAULT_DELETE);
        if (conflict.hasConflict && !conflict.reason.includes('unsaved')) {
            return {
                ready: false,
                error: new Error(conflict.reason),
                requiresConfirmation: false,
                message: conflict.reason
            };
        }

        // Check for unsaved changes
        const unsavedState = this.getUnsavedState();
        if (unsavedState.hasUnsavedChanges && unsavedState.vaultId === vaultId) {
            // Try to save
            const saveResult = await this.ensureSavedBeforeVaultOperation(vaultId);

            if (!saveResult.saved) {
                return {
                    ready: false,
                    error: saveResult.error,
                    requiresConfirmation: true,
                    message: 'Unable to save current changes. Proceed anyway?'
                };
            }
        }

        return {
            ready: true,
            error: null,
            requiresConfirmation: false,
            message: null
        };
    }

    /**
     * Subscribe to sync events
     * @param {Function} listener
     * @returns {Function} Unsubscribe function
     */
    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /**
     * Notify listeners of sync events
     * @param {string} event - Event name
     * @param {Object} data - Event data
     */
    notify(event, data) {
        this.listeners.forEach(listener => {
            try {
                listener(event, data);
            } catch (error) {
                console.error('[SyncService] Listener error:', error);
            }
        });
    }
}

// Export singleton instance
export const syncService = new SyncService();

// Export class for testing
export { SyncService };
