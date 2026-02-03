/**
 * State Manager
 * Simple vanilla JS state management with event-based updates
 */

/**
 * Creates a state store with subscription support
 * @param {Object} initialState - Initial state object
 * @returns {Object} Store with getState, setState, and subscribe methods
 */
function createStore(initialState) {
  let state = { ...initialState };
  const listeners = new Set();

  return {
    getState() {
      return state;
    },

    setState(updates) {
      const prevState = state;
      state = { ...state, ...updates };

      // Notify all listeners
      listeners.forEach(listener => {
        try {
          listener(state, prevState);
        } catch (error) {
          console.error('State listener error:', error);
        }
      });
    },

    subscribe(listener) {
      listeners.add(listener);
      // Return unsubscribe function
      return () => listeners.delete(listener);
    },

    // Get a specific property
    get(key) {
      return state[key];
    }
  };
}

/**
 * Vault State
 * Manages vault list, active vault, and loading states
 */
export const vaultState = createStore({
  vaults: [],           // List of all vault metadata
  activeVault: null,    // Currently open vault
  lastVaultId: null,    // ID of last opened vault (for auto-restore)
  isLoading: false,     // Loading state for async operations
  error: null           // Error message if any
});

/**
 * File System State
 * Manages file tree, active file, and unsaved changes
 */
export const fileSystemState = createStore({
  fileTree: [],         // Array of file/folder entries
  activeFile: null,     // Currently selected file { path, name, content }
  expandedFolders: new Set(), // Set of expanded folder paths
  unsavedChanges: false,      // Whether active file has unsaved changes
  isLoading: false,
  error: null
});

/**
 * App State
 * Manages overall app state and navigation
 */
export const appState = createStore({
  currentView: 'welcome',  // 'welcome' | 'vault' | 'editor'
  isInitialized: false
});

/**
 * Local Storage Keys
 */
const STORAGE_KEYS = {
  LAST_VAULT_ID: 'dubun_lastVaultId',
  EXPANDED_FOLDERS: 'dubun_expandedFolders'
};

/**
 * Persist last vault ID to localStorage
 * @param {string|null} vaultId
 */
export function persistLastVaultId(vaultId) {
  if (vaultId) {
    localStorage.setItem(STORAGE_KEYS.LAST_VAULT_ID, vaultId);
  } else {
    localStorage.removeItem(STORAGE_KEYS.LAST_VAULT_ID);
  }
}

/**
 * Get last vault ID from localStorage
 * @returns {string|null}
 */
export function getPersistedLastVaultId() {
  return localStorage.getItem(STORAGE_KEYS.LAST_VAULT_ID);
}

/**
 * Persist expanded folders for a vault
 * @param {string} vaultId
 * @param {Set<string>} expandedFolders
 */
export function persistExpandedFolders(vaultId, expandedFolders) {
  const key = `${STORAGE_KEYS.EXPANDED_FOLDERS}_${vaultId}`;
  localStorage.setItem(key, JSON.stringify([...expandedFolders]));
}

/**
 * Get persisted expanded folders for a vault
 * @param {string} vaultId
 * @returns {Set<string>}
 */
export function getPersistedExpandedFolders(vaultId) {
  const key = `${STORAGE_KEYS.EXPANDED_FOLDERS}_${vaultId}`;
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      return new Set(JSON.parse(stored));
    }
  } catch (error) {
    console.error('Failed to parse expanded folders:', error);
  }
  return new Set();
}

/**
 * Clear all persisted state
 */
export function clearPersistedState() {
  Object.values(STORAGE_KEYS).forEach(key => {
    // Clear base keys
    localStorage.removeItem(key);
    // Clear any vault-specific keys
    Object.keys(localStorage)
      .filter(k => k.startsWith(key))
      .forEach(k => localStorage.removeItem(k));
  });
}

/**
 * Clear cached state for a specific vault
 * Should be called when a vault is deleted to prevent stale state
 * @param {string} vaultId - Vault ID to clear cache for
 */
export function clearVaultCache(vaultId) {
  if (!vaultId) return;

  // Clear expanded folders for this vault
  const expandedKey = `${STORAGE_KEYS.EXPANDED_FOLDERS}_${vaultId}`;
  localStorage.removeItem(expandedKey);

  // Clear lastVaultId if it matches the deleted vault
  const lastVaultId = localStorage.getItem(STORAGE_KEYS.LAST_VAULT_ID);
  if (lastVaultId === vaultId) {
    localStorage.removeItem(STORAGE_KEYS.LAST_VAULT_ID);
  }

  console.log(`Cleared cache for vault: ${vaultId}`);
}
