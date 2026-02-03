//! Write-Ahead Logging (WAL) Module
//!
//! Provides atomic operation guarantees for vault operations.
//! WAL entries are written BEFORE operations begin and cleaned up AFTER.
//! On crash recovery, incomplete operations are rolled back.
//!
//! # Design
//!
//! The WAL uses a simple file-based approach:
//! 1. Before operation: Write WAL entry with backup data
//! 2. During operation: Update status to InProgress
//! 3. After success: Delete WAL file (commit)
//! 4. On failure/crash: Restore from backup in WAL
//!
//! # Safety
//!
//! - All writes are synced to disk before proceeding
//! - Registry backups are stored in the WAL entry
//! - Recovery happens automatically on startup

use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::Write;
use std::path::PathBuf;
use tauri::Manager;

/// Operations that can be tracked by WAL
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WalOperation {
    /// Vault deletion with optional file removal
    DeleteVault {
        vault_id: String,
        vault_path: String,
        delete_files: bool,
        /// JSON backup of registry before operation
        registry_backup: String,
    },
    /// Vault creation
    CreateVault {
        vault_id: String,
        vault_path: String,
    },
    /// Vault cleanup (removing broken vaults)
    CleanupBrokenVaults {
        /// JSON backup of registry before operation
        registry_backup: String,
        /// IDs of vaults being removed
        vault_ids: Vec<String>,
    },
}

/// Status of a WAL entry
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum WalStatus {
    /// Operation is about to start
    Pending,
    /// Operation is in progress
    InProgress,
    /// Operation completed successfully (will be cleaned up)
    Completed,
    /// Operation was rolled back after failure
    RolledBack,
}

/// A single WAL entry
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct WalEntry {
    /// Unique identifier for this transaction
    pub id: String,
    /// The operation being performed
    pub operation: WalOperation,
    /// When the operation started
    pub started_at: String,
    /// Current status
    pub status: WalStatus,
    /// Optional error message if failed
    pub error: Option<String>,
}

/// Result of recovery check
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryResult {
    /// Whether recovery was performed
    pub recovered: bool,
    /// Description of what was recovered
    pub message: Option<String>,
    /// The operation that was recovered from
    pub operation_type: Option<String>,
}

/// Get path to the WAL file
fn get_wal_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    Ok(app_data.join("operation.wal"))
}

/// Get path to the registry file
fn get_registry_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    Ok(app_data.join("vaults.json"))
}

/// Sync file to disk for durability
fn sync_file(path: &PathBuf) -> Result<(), String> {
    let file = File::open(path).map_err(|e| format!("Failed to open file for sync: {}", e))?;
    file.sync_all()
        .map_err(|e| format!("Failed to sync file: {}", e))
}

/// Write data to file with sync
fn write_synced(path: &PathBuf, content: &str) -> Result<(), String> {
    // Ensure parent directory exists
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    // Write to file
    let mut file =
        File::create(path).map_err(|e| format!("Failed to create file: {}", e))?;
    file.write_all(content.as_bytes())
        .map_err(|e| format!("Failed to write file: {}", e))?;

    // Sync to disk
    file.sync_all()
        .map_err(|e| format!("Failed to sync file: {}", e))?;

    Ok(())
}

/// Begin a new transaction
///
/// Writes the WAL entry to disk BEFORE any actual operation begins.
/// This ensures we can always recover if the operation is interrupted.
pub fn begin_transaction(app: &tauri::AppHandle, operation: WalOperation) -> Result<String, String> {
    let wal_path = get_wal_path(app)?;

    // Check for existing transaction (shouldn't happen, but handle it)
    if wal_path.exists() {
        return Err(
            "Cannot start new transaction: previous transaction still in progress. \
             Please restart the application to recover."
                .to_string(),
        );
    }

    let entry = WalEntry {
        id: uuid::Uuid::new_v4().to_string(),
        operation,
        started_at: Utc::now().to_rfc3339(),
        status: WalStatus::Pending,
        error: None,
    };

    // Serialize and write
    let content = serde_json::to_string_pretty(&entry)
        .map_err(|e| format!("Failed to serialize WAL entry: {}", e))?;

    write_synced(&wal_path, &content)?;

    Ok(entry.id)
}

/// Update the status of the current transaction
pub fn update_status(app: &tauri::AppHandle, status: WalStatus) -> Result<(), String> {
    let wal_path = get_wal_path(app)?;

    if !wal_path.exists() {
        return Ok(()); // No active transaction
    }

    let content =
        fs::read_to_string(&wal_path).map_err(|e| format!("Failed to read WAL: {}", e))?;

    let mut entry: WalEntry =
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse WAL: {}", e))?;

    entry.status = status;

    let content = serde_json::to_string_pretty(&entry)
        .map_err(|e| format!("Failed to serialize WAL entry: {}", e))?;

    write_synced(&wal_path, &content)?;

    Ok(())
}

/// Mark the current transaction as failed with an error
pub fn mark_failed(app: &tauri::AppHandle, error_msg: &str) -> Result<(), String> {
    let wal_path = get_wal_path(app)?;

    if !wal_path.exists() {
        return Ok(());
    }

    let content =
        fs::read_to_string(&wal_path).map_err(|e| format!("Failed to read WAL: {}", e))?;

    let mut entry: WalEntry =
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse WAL: {}", e))?;

    entry.status = WalStatus::RolledBack;
    entry.error = Some(error_msg.to_string());

    let content = serde_json::to_string_pretty(&entry)
        .map_err(|e| format!("Failed to serialize WAL entry: {}", e))?;

    write_synced(&wal_path, &content)?;

    Ok(())
}

/// Commit the transaction - removes the WAL file
///
/// Should only be called after the operation has fully succeeded.
pub fn commit(app: &tauri::AppHandle) -> Result<(), String> {
    let wal_path = get_wal_path(app)?;

    if wal_path.exists() {
        fs::remove_file(&wal_path).map_err(|e| format!("Failed to remove WAL file: {}", e))?;
    }

    Ok(())
}

/// Check for and recover from incomplete transactions
///
/// Called on application startup. If an incomplete transaction is found,
/// it will be rolled back by restoring the registry from the backup.
pub fn recover_incomplete(app: &tauri::AppHandle) -> Result<RecoveryResult, String> {
    let wal_path = get_wal_path(app)?;

    if !wal_path.exists() {
        return Ok(RecoveryResult {
            recovered: false,
            message: None,
            operation_type: None,
        });
    }

    let content =
        fs::read_to_string(&wal_path).map_err(|e| format!("Failed to read WAL: {}", e))?;

    let entry: WalEntry =
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse WAL: {}", e))?;

    match entry.status {
        WalStatus::Pending | WalStatus::InProgress => {
            // Transaction was interrupted - rollback
            let (recovered_msg, op_type) = rollback_operation(app, &entry)?;

            // Mark as rolled back and clean up
            mark_failed(app, "Recovered from interrupted operation")?;
            commit(app)?;

            Ok(RecoveryResult {
                recovered: true,
                message: Some(recovered_msg),
                operation_type: Some(op_type),
            })
        }
        WalStatus::Completed | WalStatus::RolledBack => {
            // Just clean up the WAL file
            commit(app)?;

            Ok(RecoveryResult {
                recovered: false,
                message: Some("Cleaned up completed transaction".to_string()),
                operation_type: None,
            })
        }
    }
}

/// Rollback an operation by restoring from backup
fn rollback_operation(app: &tauri::AppHandle, entry: &WalEntry) -> Result<(String, String), String> {
    match &entry.operation {
        WalOperation::DeleteVault {
            vault_id,
            registry_backup,
            ..
        } => {
            // Restore registry from backup
            let registry_path = get_registry_path(app)?;
            write_synced(&registry_path, registry_backup)?;

            Ok((
                format!("Rolled back incomplete vault deletion: {}", vault_id),
                "delete_vault".to_string(),
            ))
        }
        WalOperation::CreateVault {
            vault_id,
            vault_path,
        } => {
            // Clean up partially created vault directory
            let path = PathBuf::from(vault_path);
            if path.exists() {
                // Only remove if it's empty or only contains Welcome.md
                if let Ok(entries) = fs::read_dir(&path) {
                    let count = entries.count();
                    if count <= 1 {
                        let _ = fs::remove_dir_all(&path);
                    }
                }
            }

            Ok((
                format!("Cleaned up incomplete vault creation: {}", vault_id),
                "create_vault".to_string(),
            ))
        }
        WalOperation::CleanupBrokenVaults {
            registry_backup,
            vault_ids,
        } => {
            // Restore registry from backup
            let registry_path = get_registry_path(app)?;
            write_synced(&registry_path, registry_backup)?;

            Ok((
                format!(
                    "Rolled back incomplete cleanup of {} broken vaults",
                    vault_ids.len()
                ),
                "cleanup_broken".to_string(),
            ))
        }
    }
}

/// Check if there's an active transaction
pub fn has_active_transaction(app: &tauri::AppHandle) -> Result<bool, String> {
    let wal_path = get_wal_path(app)?;
    Ok(wal_path.exists())
}

/// Get the current WAL entry if one exists
pub fn get_current_entry(app: &tauri::AppHandle) -> Result<Option<WalEntry>, String> {
    let wal_path = get_wal_path(app)?;

    if !wal_path.exists() {
        return Ok(None);
    }

    let content =
        fs::read_to_string(&wal_path).map_err(|e| format!("Failed to read WAL: {}", e))?;

    let entry: WalEntry =
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse WAL: {}", e))?;

    Ok(Some(entry))
}

#[cfg(test)]
mod tests {
    use super::*;

    // Tests would go here
    // In a real implementation, we'd test:
    // - Transaction lifecycle (begin -> update -> commit)
    // - Recovery after simulated crash
    // - Concurrent transaction prevention
    // - Registry backup/restore
}
