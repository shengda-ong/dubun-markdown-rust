/**
 * Operation Store
 *
 * Tracks the lifecycle of async operations to prevent race conditions.
 * Provides a centralized way to monitor operation states across the application.
 *
 * Key features:
 * - Operation state machine: idle -> in_progress -> completed | failed
 * - Prevents UI from closing modals before operations complete
 * - Provides operation status for UI feedback
 * - Auto-cleanup of completed operations
 *
 * @module core/operationStore
 */

/**
 * Operation states
 * @readonly
 * @enum {string}
 */
export const OperationState = Object.freeze({
    IDLE: 'idle',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    FAILED: 'failed'
});

/**
 * Operation types - categorizes operations for filtering and coordination
 * @readonly
 * @enum {string}
 */
export const OperationType = Object.freeze({
    VAULT_CREATE: 'vault_create',
    VAULT_DELETE: 'vault_delete',
    VAULT_OPEN: 'vault_open',
    FILE_SAVE: 'file_save',
    FILE_DELETE: 'file_delete',
    FILE_CREATE: 'file_create',
    FILE_TREE_LOAD: 'file_tree_load',
    HEALTH_CHECK: 'health_check',
    CLEANUP_BROKEN: 'cleanup_broken'
});

/**
 * @typedef {Object} Operation
 * @property {string} id - Unique operation identifier
 * @property {OperationType} type - Type of operation
 * @property {OperationState} state - Current state
 * @property {string|null} resourceId - Optional resource being operated on
 * @property {Error|null} error - Error if operation failed
 * @property {number} startTime - Timestamp when operation started
 * @property {number|null} endTime - Timestamp when operation completed/failed
 * @property {Object|null} metadata - Additional operation-specific data
 */

/**
 * Creates the operation store singleton
 * @returns {Object} Store with operation tracking methods
 */
function createOperationStore() {
    /** @type {Map<string, Operation>} */
    const operations = new Map();

    /** @type {Set<Function>} */
    const listeners = new Set();

    /** Auto-cleanup delay for completed operations (ms) */
    const CLEANUP_DELAY = 2000;

    /**
     * Generate a unique operation ID
     * @returns {string}
     */
    function generateId() {
        return `op_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }

    /**
     * Notify all subscribers of state changes
     */
    function notify() {
        const snapshot = new Map(operations);
        listeners.forEach(listener => {
            try {
                listener(snapshot);
            } catch (error) {
                console.error('[OperationStore] Listener error:', error);
            }
        });
    }

    /**
     * Schedule auto-cleanup of completed/failed operations
     * @param {string} operationId
     */
    function scheduleCleanup(operationId) {
        setTimeout(() => {
            const op = operations.get(operationId);
            if (op && (op.state === OperationState.COMPLETED || op.state === OperationState.FAILED)) {
                operations.delete(operationId);
                notify();
            }
        }, CLEANUP_DELAY);
    }

    return {
        /**
         * Start tracking a new operation
         * @param {OperationType} type - Type of operation
         * @param {Object} options - Optional configuration
         * @param {string} [options.resourceId] - ID of resource being operated on
         * @param {Object} [options.metadata] - Additional operation data
         * @returns {string} Operation ID for tracking
         */
        startOperation(type, options = {}) {
            const { resourceId = null, metadata = null } = options;

            const id = generateId();
            const operation = {
                id,
                type,
                state: OperationState.IN_PROGRESS,
                resourceId,
                error: null,
                startTime: Date.now(),
                endTime: null,
                metadata
            };

            operations.set(id, operation);
            notify();

            console.debug(`[OperationStore] Started: ${type}`, { id, resourceId });
            return id;
        },

        /**
         * Mark an operation as successfully completed
         * @param {string} operationId - ID of operation to complete
         */
        completeOperation(operationId) {
            const op = operations.get(operationId);
            if (!op) {
                console.warn(`[OperationStore] Cannot complete unknown operation: ${operationId}`);
                return;
            }

            op.state = OperationState.COMPLETED;
            op.endTime = Date.now();
            notify();

            const duration = op.endTime - op.startTime;
            console.debug(`[OperationStore] Completed: ${op.type} in ${duration}ms`);

            scheduleCleanup(operationId);
        },

        /**
         * Mark an operation as failed
         * @param {string} operationId - ID of operation that failed
         * @param {Error|string} error - Error that caused the failure
         */
        failOperation(operationId, error) {
            const op = operations.get(operationId);
            if (!op) {
                console.warn(`[OperationStore] Cannot fail unknown operation: ${operationId}`);
                return;
            }

            op.state = OperationState.FAILED;
            op.error = error instanceof Error ? error : new Error(String(error));
            op.endTime = Date.now();
            notify();

            console.error(`[OperationStore] Failed: ${op.type}`, op.error);

            scheduleCleanup(operationId);
        },

        /**
         * Get an operation by ID
         * @param {string} operationId
         * @returns {Operation|undefined}
         */
        getOperation(operationId) {
            return operations.get(operationId);
        },

        /**
         * Check if any operation of a given type is in progress
         * @param {OperationType} type - Type to check
         * @returns {boolean}
         */
        isOperationInProgress(type) {
            for (const op of operations.values()) {
                if (op.type === type && op.state === OperationState.IN_PROGRESS) {
                    return true;
                }
            }
            return false;
        },

        /**
         * Check if a specific resource has an operation in progress
         * @param {string} resourceId - Resource ID to check
         * @returns {boolean}
         */
        isResourceBusy(resourceId) {
            for (const op of operations.values()) {
                if (op.resourceId === resourceId && op.state === OperationState.IN_PROGRESS) {
                    return true;
                }
            }
            return false;
        },

        /**
         * Get all currently active (in-progress) operations
         * @returns {Operation[]}
         */
        getActiveOperations() {
            return Array.from(operations.values())
                .filter(op => op.state === OperationState.IN_PROGRESS);
        },

        /**
         * Get operations by type
         * @param {OperationType} type
         * @returns {Operation[]}
         */
        getOperationsByType(type) {
            return Array.from(operations.values())
                .filter(op => op.type === type);
        },

        /**
         * Check if there are any operations blocking a given action
         * @param {OperationType} actionType - The action being attempted
         * @param {string} [resourceId] - Optional resource ID
         * @returns {{blocked: boolean, reason: string|null}}
         */
        checkBlocking(actionType, resourceId = null) {
            // Vault operations block each other
            const vaultOps = [OperationType.VAULT_CREATE, OperationType.VAULT_DELETE, OperationType.VAULT_OPEN];

            if (vaultOps.includes(actionType)) {
                for (const op of operations.values()) {
                    if (vaultOps.includes(op.type) && op.state === OperationState.IN_PROGRESS) {
                        return {
                            blocked: true,
                            reason: `Another vault operation is in progress: ${op.type}`
                        };
                    }
                }
            }

            // Resource-specific blocking
            if (resourceId) {
                for (const op of operations.values()) {
                    if (op.resourceId === resourceId && op.state === OperationState.IN_PROGRESS) {
                        return {
                            blocked: true,
                            reason: `Resource is busy with: ${op.type}`
                        };
                    }
                }
            }

            return { blocked: false, reason: null };
        },

        /**
         * Subscribe to operation state changes
         * @param {Function} listener - Callback receiving Map of operations
         * @returns {Function} Unsubscribe function
         */
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },

        /**
         * Get a snapshot of all operations (for debugging)
         * @returns {Map<string, Operation>}
         */
        getSnapshot() {
            return new Map(operations);
        },

        /**
         * Clear all operations (use with caution - mainly for testing)
         */
        clear() {
            operations.clear();
            notify();
        }
    };
}

// Export singleton instance
export const operationStore = createOperationStore();

// Export for testing
export { createOperationStore };
