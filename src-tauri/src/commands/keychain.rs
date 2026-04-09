use keyring::{credential::CredentialPersistence, default::default_credential_builder, Entry};
use tauri::command;

const SERVICE: &str = "starfield-app";
const DEEPSEEK_KEY_ACCOUNT: &str = "deepseek-api-key";
const TAVILY_KEY_ACCOUNT: &str = "tavily-api-key";

fn ensure_persistent_backend() -> Result<(), String> {
    let persistence = default_credential_builder().persistence();
    if matches!(persistence, CredentialPersistence::UntilDelete) {
        Ok(())
    } else {
        Err(
            "Secure credential storage is unavailable on this device. \
             Starfield refused to store the API key in a non-persistent mock keyring."
                .to_string(),
        )
    }
}

fn keyring_entry(account: &str) -> Result<Entry, String> {
    ensure_persistent_backend()?;
    Entry::new(SERVICE, account).map_err(|e| e.to_string())
}

fn read_key(account: &str) -> Result<Option<String>, String> {
    let entry = keyring_entry(account)?;
    match entry.get_password() {
        Ok(key) => Ok(Some(key)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

fn save_key(account: &str, key: &str) -> Result<(), String> {
    let entry = keyring_entry(account)?;
    entry.set_password(key).map_err(|e| e.to_string())?;
    // Verify the write
    match entry.get_password() {
        Ok(saved) if saved == key => Ok(()),
        Ok(_) => Err("API key could not be verified after saving.".to_string()),
        Err(e) => Err(format!("Key written but could not be read back: {e}")),
    }
}

fn delete_key(account: &str) -> Result<(), String> {
    let entry = keyring_entry(account)?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

// ── Public read helper (used by luna.rs / search.rs) ─────────────────────

pub fn read_deepseek_key() -> Result<Option<String>, String> {
    read_key(DEEPSEEK_KEY_ACCOUNT)
}

pub fn read_tavily_key() -> Result<Option<String>, String> {
    read_key(TAVILY_KEY_ACCOUNT)
}

// ── Tauri commands ────────────────────────────────────────────────────────

#[command]
pub fn save_deepseek_key(key: String) -> Result<(), String> {
    save_key(DEEPSEEK_KEY_ACCOUNT, &key)
}

#[command]
pub fn get_deepseek_key() -> Result<Option<String>, String> {
    read_deepseek_key()
}

#[command]
pub fn delete_deepseek_key() -> Result<(), String> {
    delete_key(DEEPSEEK_KEY_ACCOUNT)
}

#[command]
pub fn save_tavily_key(key: String) -> Result<(), String> {
    save_key(TAVILY_KEY_ACCOUNT, &key)
}

#[command]
pub fn get_tavily_key() -> Result<Option<String>, String> {
    read_tavily_key()
}

#[command]
pub fn delete_tavily_key() -> Result<(), String> {
    delete_key(TAVILY_KEY_ACCOUNT)
}
