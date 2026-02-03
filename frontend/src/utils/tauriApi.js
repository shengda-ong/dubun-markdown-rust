/**
 * Tauri API Bridge
 * JavaScript wrapper to invoke Tauri commands for vault and file operations
 */

// Check if running in Tauri environment
export function isTauri() {
  return window.__TAURI__ !== undefined;
}

// Get the Tauri invoke function
function getInvoke() {
  if (!isTauri()) {
    console.warn('Not running in Tauri environment');
    return null;
  }
  return window.__TAURI__.core.invoke;
}

/**
 * Vault API - Operations for managing vaults
 */
export const vaultApi = {
  /**
   * Get the app data directory path
   * @returns {Promise<string>}
   */
  async getAppDataDir() {
    const invoke = getInvoke();
    if (!invoke) return null;
    return invoke('get_app_data_dir');
  },

  /**
   * List all registered vaults with their health status
   * @returns {Promise<{vaults: Array, lastVaultId: string|null}>}
   */
  async listVaults() {
    const invoke = getInvoke();
    if (!invoke) return { vaults: [], lastVaultId: null };
    return invoke('list_vaults');
  },

  /**
   * Create a new vault in the default location
   * @param {string} name - Vault name
   * @returns {Promise<Object>} Created vault metadata
   */
  async createVault(name) {
    const invoke = getInvoke();
    if (!invoke) throw new Error('Not in Tauri environment');
    return invoke('create_vault', { name });
  },

  /**
   * Add an external folder as a vault (creates subfolder with vault name)
   * @param {string} path - Parent directory path
   * @param {string} name - Vault name
   * @returns {Promise<Object>} Created vault metadata
   */
  async addExternalVault(path, name) {
    const invoke = getInvoke();
    if (!invoke) throw new Error('Not in Tauri environment');
    return invoke('add_external_vault', { path, name });
  },

  /**
   * Open a vault (sets as active, updates last_opened)
   * @param {string} vaultId - Vault ID
   * @returns {Promise<Object>} Vault metadata
   */
  async openVault(vaultId) {
    const invoke = getInvoke();
    if (!invoke) throw new Error('Not in Tauri environment');
    return invoke('open_vault', { vault_id: vaultId });
  },

  /**
   * Delete a vault from registry (optionally delete files)
   * @param {string} vaultId - Vault ID
   * @param {boolean} deleteFiles - Whether to delete the actual files
   * @returns {Promise<void>}
   */
  async deleteVault(vaultId, deleteFiles = false) {
    const invoke = getInvoke();
    if (!invoke) throw new Error('Not in Tauri environment');
    return invoke('delete_vault', { vault_id: vaultId, delete_files: deleteFiles });
  },

  /**
   * Remove a broken vault entry from registry
   * @param {string} vaultId - Vault ID
   * @returns {Promise<void>}
   */
  async removeBrokenVault(vaultId) {
    const invoke = getInvoke();
    if (!invoke) throw new Error('Not in Tauri environment');
    return invoke('remove_broken_vault', { vault_id: vaultId });
  },

  /**
   * Check health of all vaults
   * @returns {Promise<{healthy: Array, broken: Array, recoveredOperations: Array, needsUserAction: boolean, totalCount: number}>}
   */
  async checkVaultHealth() {
    const invoke = getInvoke();
    if (!invoke) throw new Error('Not in Tauri environment');
    return invoke('check_vault_health');
  },

  /**
   * Clean up all broken vaults from registry
   * @returns {Promise<{cleaned: number, cleanedIds: Array<string>}>}
   */
  async cleanupAllBrokenVaults() {
    const invoke = getInvoke();
    if (!invoke) throw new Error('Not in Tauri environment');
    return invoke('cleanup_all_broken_vaults');
  }
};

/**
 * File API - Operations for file system within vaults
 */
export const fileApi = {
  /**
   * Read file content
   * @param {string} path - File path
   * @returns {Promise<string>} File content
   */
  async readFile(path) {
    const invoke = getInvoke();
    if (!invoke) throw new Error('Not in Tauri environment');
    return invoke('read_file', { path });
  },

  /**
   * Write file content (only within registered vaults)
   * @param {string} path - File path
   * @param {string} content - File content
   * @returns {Promise<void>}
   */
  async writeFile(path, content) {
    const invoke = getInvoke();
    if (!invoke) throw new Error('Not in Tauri environment');
    return invoke('write_file', { path, content });
  },

  /**
   * List directory contents
   * @param {string} path - Directory path
   * @returns {Promise<Array<{name: string, path: string, isDirectory: boolean}>>}
   */
  async listDirectory(path) {
    const invoke = getInvoke();
    if (!invoke) return [];
    return invoke('list_directory', { path });
  },

  /**
   * Create a directory (only within registered vaults)
   * @param {string} path - Directory path
   * @returns {Promise<void>}
   */
  async createDirectory(path) {
    const invoke = getInvoke();
    if (!invoke) throw new Error('Not in Tauri environment');
    return invoke('create_directory', { path });
  },

  /**
   * Delete a file or directory (only within registered vaults)
   * @param {string} path - Path to delete
   * @returns {Promise<void>}
   */
  async deletePath(path) {
    const invoke = getInvoke();
    if (!invoke) throw new Error('Not in Tauri environment');
    return invoke('delete_path', { path });
  },

  /**
   * Rename a file or directory (only within registered vaults)
   * @param {string} oldPath - Current path
   * @param {string} newPath - New path
   * @returns {Promise<void>}
   */
  async renamePath(oldPath, newPath) {
    const invoke = getInvoke();
    if (!invoke) throw new Error('Not in Tauri environment');
    return invoke('rename_path', { old_path: oldPath, new_path: newPath });
  },

  /**
   * Get canonical (resolved) path for symlink cycle detection
   * @param {string} path - Path to resolve
   * @returns {Promise<string>} Canonical path
   */
  async getCanonicalPath(path) {
    const invoke = getInvoke();
    if (!invoke) throw new Error('Not in Tauri environment');
    return invoke('get_canonical_path', { path });
  }
};

/**
 * Dialog API - Native dialog operations
 */
export const dialogApi = {
  /**
   * Open a folder picker dialog
   * @returns {Promise<string|null>} Selected folder path or null if cancelled
   */
  async openFolderDialog() {
    if (!isTauri()) return null;

    try {
      const invoke = getInvoke();
      if (!invoke) return null;

      // Invoke the dialog plugin command directly
      // The plugin command format is 'plugin:dialog|open'
      // Parameters must be wrapped in 'options' object for Tauri v2
      const selected = await invoke('plugin:dialog|open', {
        options: {
          directory: true,
          multiple: false,
          title: 'Select folder for vault'
        }
      });
      return selected;
    } catch (error) {
      console.error('Failed to open folder dialog:', error);
      return null;
    }
  }
};
