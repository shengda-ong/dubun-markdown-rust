/**
 * Operation Queue
 *
 * Serializes critical operations to prevent race conditions and ensure data integrity.
 * Uses resource-level locking and separate queues for different operation types.
 *
 * Key features:
 * - Serial execution of operations on the same resource
 * - Resource-level locking to prevent concurrent modifications
 * - Timeout handling for hung operations
 * - Priority support for critical operations
 *
 * @module core/operationQueue
 */

/**
 * @typedef {Object} QueueOptions
 * @property {string} [resourceId] - Specific resource ID for locking
 * @property {'high'|'normal'} [priority='normal'] - Operation priority
 * @property {number} [timeout=30000] - Operation timeout in ms
 * @property {string} [description] - Human-readable description for debugging
 */

/**
 * @typedef {Object} QueuedOperation
 * @property {string} id - Unique operation ID
 * @property {Function} operation - The async operation to execute
 * @property {QueueOptions} options - Operation options
 * @property {Function} resolve - Promise resolve function
 * @property {Function} reject - Promise reject function
 * @property {number} queuedAt - Timestamp when queued
 */

/**
 * Creates an operation queue instance
 * @returns {Object} Queue with enqueue and management methods
 */
function createOperationQueue() {
    /** @type {Map<string, Promise<any>>} - Queues by resource type */
    const queues = new Map();

    /** @type {Map<string, string>} - Resource locks: resourceId -> operationId */
    const locks = new Map();

    /** @type {Map<string, QueuedOperation>} - Active operations for monitoring */
    const activeOperations = new Map();

    /** Default timeout for operations */
    const DEFAULT_TIMEOUT = 30000;

    /**
     * Generate a unique operation ID
     * @returns {string}
     */
    function generateId() {
        return `queue_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }

    /**
     * Wrap a promise with timeout
     * @param {Promise<T>} promise
     * @param {number} ms - Timeout in milliseconds
     * @param {string} operationId - For error message
     * @returns {Promise<T>}
     * @template T
     */
    async function withTimeout(promise, ms, operationId) {
        let timeoutId;

        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
                reject(new Error(`Operation ${operationId} timed out after ${ms}ms`));
            }, ms);
        });

        try {
            const result = await Promise.race([promise, timeoutPromise]);
            clearTimeout(timeoutId);
            return result;
        } catch (error) {
            clearTimeout(timeoutId);
            throw error;
        }
    }

    return {
        /**
         * Enqueue an operation for serial execution
         * @param {string} resourceType - Type of resource (e.g., 'vault', 'file')
         * @param {Function} operation - Async operation to execute
         * @param {QueueOptions} [options={}] - Optional settings
         * @returns {Promise<any>} Result of the operation
         */
        async enqueue(resourceType, operation, options = {}) {
            const {
                resourceId = null,
                priority = 'normal',
                timeout = DEFAULT_TIMEOUT,
                description = ''
            } = options;

            const operationId = generateId();

            // Check for resource-level lock conflict
            if (resourceId && locks.has(resourceId)) {
                const lockingOpId = locks.get(resourceId);
                throw new Error(
                    `Resource "${resourceId}" is locked by operation ${lockingOpId}. ` +
                    `Cannot start new operation: ${description || resourceType}`
                );
            }

            // Acquire resource lock if specified
            if (resourceId) {
                locks.set(resourceId, operationId);
            }

            // Get or create queue for this resource type
            if (!queues.has(resourceType)) {
                queues.set(resourceType, Promise.resolve());
            }

            const currentQueue = queues.get(resourceType);

            // Create the wrapped operation
            const wrappedOperation = async () => {
                const startTime = Date.now();
                console.debug(`[OperationQueue] Starting: ${resourceType}`, {
                    operationId,
                    resourceId,
                    description
                });

                try {
                    // Wait for previous operations in this queue
                    await currentQueue;

                    // Track active operation
                    activeOperations.set(operationId, {
                        id: operationId,
                        resourceType,
                        resourceId,
                        description,
                        startTime
                    });

                    // Execute with timeout
                    const result = await withTimeout(
                        Promise.resolve(operation()),
                        timeout,
                        operationId
                    );

                    const duration = Date.now() - startTime;
                    console.debug(`[OperationQueue] Completed: ${resourceType} in ${duration}ms`, {
                        operationId
                    });

                    return result;
                } finally {
                    // Always release the lock and clean up
                    if (resourceId && locks.get(resourceId) === operationId) {
                        locks.delete(resourceId);
                    }
                    activeOperations.delete(operationId);
                }
            };

            // Chain this operation after the current queue
            // Use .catch to prevent queue breakage on error (error is still thrown to caller)
            const newQueue = wrappedOperation();
            queues.set(resourceType, newQueue.catch(() => {}));

            return newQueue;
        },

        /**
         * Check if a resource is currently locked
         * @param {string} resourceId - Resource ID to check
         * @returns {boolean}
         */
        isLocked(resourceId) {
            return locks.has(resourceId);
        },

        /**
         * Get the operation ID that holds a lock
         * @param {string} resourceId
         * @returns {string|undefined}
         */
        getLockHolder(resourceId) {
            return locks.get(resourceId);
        },

        /**
         * Get all currently active operations
         * @returns {Array<Object>}
         */
        getActiveOperations() {
            return Array.from(activeOperations.values());
        },

        /**
         * Check if any operations are active for a resource type
         * @param {string} resourceType
         * @returns {boolean}
         */
        hasActiveOperations(resourceType) {
            for (const op of activeOperations.values()) {
                if (op.resourceType === resourceType) {
                    return true;
                }
            }
            return false;
        },

        /**
         * Get queue statistics for monitoring
         * @returns {Object}
         */
        getStats() {
            return {
                activeOperations: activeOperations.size,
                lockedResources: locks.size,
                queueTypes: Array.from(queues.keys())
            };
        },

        /**
         * Force release a lock (use with caution - for error recovery only)
         * @param {string} resourceId
         */
        forceReleaseLock(resourceId) {
            if (locks.has(resourceId)) {
                console.warn(`[OperationQueue] Force releasing lock on: ${resourceId}`);
                locks.delete(resourceId);
            }
        },

        /**
         * Clear all queues and locks (for testing/reset)
         */
        clear() {
            queues.clear();
            locks.clear();
            activeOperations.clear();
        }
    };
}

// Create singleton instance
const operationQueue = createOperationQueue();

/**
 * Convenience functions for vault operations
 * Provides typed wrappers with appropriate defaults
 */
export const vaultQueue = {
    /**
     * Queue a vault creation operation
     * @param {Function} operation - The create operation
     * @returns {Promise<any>}
     */
    create(operation) {
        return operationQueue.enqueue('vault', operation, {
            description: 'Create vault'
        });
    },

    /**
     * Queue a vault deletion operation
     * @param {string} vaultId - ID of vault being deleted
     * @param {Function} operation - The delete operation
     * @returns {Promise<any>}
     */
    delete(vaultId, operation) {
        return operationQueue.enqueue('vault', operation, {
            resourceId: vaultId,
            description: `Delete vault ${vaultId}`,
            timeout: 60000 // Longer timeout for delete (file system ops)
        });
    },

    /**
     * Queue a vault open operation
     * @param {string} vaultId - ID of vault being opened
     * @param {Function} operation - The open operation
     * @returns {Promise<any>}
     */
    open(vaultId, operation) {
        return operationQueue.enqueue('vault', operation, {
            resourceId: vaultId,
            description: `Open vault ${vaultId}`
        });
    },

    /**
     * Check if a vault is currently being operated on
     * @param {string} vaultId
     * @returns {boolean}
     */
    isVaultBusy(vaultId) {
        return operationQueue.isLocked(vaultId);
    }
};

/**
 * Convenience functions for file operations
 */
export const fileQueue = {
    /**
     * Queue a file save operation
     * @param {string} filePath - Path of file being saved
     * @param {Function} operation - The save operation
     * @returns {Promise<any>}
     */
    save(filePath, operation) {
        return operationQueue.enqueue('file', operation, {
            resourceId: filePath,
            description: `Save file ${filePath}`,
            timeout: 10000
        });
    },

    /**
     * Queue a file delete operation
     * @param {string} filePath - Path of file being deleted
     * @param {Function} operation - The delete operation
     * @returns {Promise<any>}
     */
    delete(filePath, operation) {
        return operationQueue.enqueue('file', operation, {
            resourceId: filePath,
            description: `Delete file ${filePath}`
        });
    },

    /**
     * Queue a file/folder creation operation
     * @param {string} parentPath - Parent path for creation
     * @param {Function} operation - The create operation
     * @returns {Promise<any>}
     */
    create(parentPath, operation) {
        return operationQueue.enqueue('file', operation, {
            description: `Create in ${parentPath}`
        });
    },

    /**
     * Check if a file is currently being operated on
     * @param {string} filePath
     * @returns {boolean}
     */
    isFileBusy(filePath) {
        return operationQueue.isLocked(filePath);
    }
};

// Export singleton and factory
export { operationQueue, createOperationQueue };
