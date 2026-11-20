use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use rusqlite::Connection;
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct BrowserProfile {
    pub label: String,
    pub profile_dir: PathBuf,
}

pub fn get_chromium_profiles(browser_name: &str) -> Vec<BrowserProfile> {
    let local_app_data = match std::env::var("LOCALAPPDATA") {
        Ok(v) => PathBuf::from(v),
        Err(_) => return Vec::new(),
    };

    let base = match browser_name {
        "Chrome" => local_app_data.join("Google").join("Chrome").join("User Data"),
        "Edge" => local_app_data.join("Microsoft").join("Edge").join("User Data"),
        "Vivaldi" => local_app_data.join("Vivaldi").join("User Data"),
        _ => return Vec::new(),
    };

    if !base.exists() {
        return Vec::new();
    }

    let mut profiles = Vec::new();
    if let Ok(entries) = fs::read_dir(&base) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            if name == "Default" || name.starts_with("Profile ") {
                let has_cookies = path.join("Network").join("Cookies").exists() || path.join("Cookies").exists();
                if has_cookies {
                    let mut label = name.clone();
                    if let Ok(pref_data) = fs::read_to_string(path.join("Preferences")) {
                        if let Ok(json) = serde_json::from_str::<Value>(&pref_data) {
                            if let Some(profile_name) = json.pointer("/profile/name").and_then(|v| v.as_str()) {
                                if !profile_name.is_empty() {
                                    label = format!("{} ({})", name, profile_name);
                                }
                            }
                        }
                    }
                    profiles.push(BrowserProfile {
                        label,
                        profile_dir: path,
                    });
                }
            }
        }
    }
    profiles.sort_by(|a, b| a.label.cmp(&b.label));
    profiles
}

#[cfg(windows)]
fn decrypt_master_key(user_data_dir: &Path) -> Option<Vec<u8>> {
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Cryptography::{CryptUnprotectData, CRYPT_INTEGER_BLOB};

    let local_state_path = user_data_dir.join("Local State");
    let content = fs::read_to_string(local_state_path).ok()?;
    let json: Value = serde_json::from_str(&content).ok()?;
    let encrypted_key_b64 = json.pointer("/os_crypt/encrypted_key")?.as_str()?;
    let encrypted_key = BASE64.decode(encrypted_key_b64).ok()?;

    if encrypted_key.len() <= 5 || &encrypted_key[0..5] != b"DPAPI" {
        return None;
    }

    let raw_payload = &encrypted_key[5..];
    unsafe {
        let mut data_in = CRYPT_INTEGER_BLOB {
            cbData: raw_payload.len() as u32,
            pbData: raw_payload.as_ptr() as *mut u8,
        };
        let mut data_out = CRYPT_INTEGER_BLOB {
            cbData: 0,
            pbData: std::ptr::null_mut(),
        };

        let success = CryptUnprotectData(
            &mut data_in,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            0,
            &mut data_out,
        );

        if success != 0 && !data_out.pbData.is_null() && data_out.cbData > 0 {
            let slice = std::slice::from_raw_parts(data_out.pbData, data_out.cbData as usize);
            let result = slice.to_vec();
            LocalFree(data_out.pbData as _);
            Some(result)
        } else {
            None
        }
    }
}

#[cfg(not(windows))]
fn decrypt_master_key(_user_data_dir: &Path) -> Option<Vec<u8>> {
    None
}

fn decrypt_cookie_value(encrypted_val: &[u8], master_key: &[u8]) -> Option<String> {
    if encrypted_val.len() < 15 {
        return None;
    }
    let prefix = &encrypted_val[0..3];
    if prefix != b"v10" && prefix != b"v11" {
        return None;
    }

    let nonce_bytes = &encrypted_val[3..15];
    let ciphertext = &encrypted_val[15..];

    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(master_key));
    let nonce = Nonce::from_slice(nonce_bytes);

    let decrypted = cipher.decrypt(nonce, ciphertext).ok()?;
    String::from_utf8(decrypted).ok()
}

pub fn read_chromium_cookies(profile_dir: &Path, domains: &[&str]) -> anyhow::Result<HashMap<String, String>> {
    let cookie_db = {
        let p1 = profile_dir.join("Network").join("Cookies");
        if p1.exists() {
            p1
        } else {
            profile_dir.join("Cookies")
        }
    };

    if !cookie_db.exists() {
        return Ok(HashMap::new());
    }

    let user_data_dir = profile_dir.parent().unwrap_or(profile_dir);
    let master_key = decrypt_master_key(user_data_dir);

    // Copy to temp file to avoid file lock
    let temp_file = tempfile::Builder::new().suffix(".db").tempfile()?;
    if let Err(e) = fs::copy(&cookie_db, temp_file.path()) {
        if e.raw_os_error() == Some(32) {
            anyhow::bail!("该浏览器正在运行并锁定了 Cookie 数据库，请先退出/完全关闭浏览器（包括托盘后台）后再读取");
        }
        return Err(e.into());
    }

    let conn = Connection::open_with_flags(
        temp_file.path(),
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_URI,
    )?;

    let mut results = HashMap::new();

    for domain in domains {
        let dot_domain = format!(".{}", domain);
        let mut stmt = conn.prepare(
            "SELECT name, value, encrypted_value FROM cookies WHERE host_key = ?1 OR host_key = ?2",
        )?;

        let mut cookie_map: HashMap<String, String> = HashMap::new();

        let rows = stmt.query_map([*domain, &dot_domain], |row| {
            let name: String = row.get(0)?;
            let value: String = row.get(1)?;
            let enc_val: Vec<u8> = row.get(2).unwrap_or_default();
            Ok((name, value, enc_val))
        })?;

        for row in rows.flatten() {
            let (name, mut val, enc_val) = row;
            if val.is_empty() && !enc_val.is_empty() {
                if let Some(ref key) = master_key {
                    if let Some(decrypted) = decrypt_cookie_value(&enc_val, key) {
                        val = decrypted;
                    }
                }
            }
            if !cookie_map.contains_key(&name) || !val.is_empty() {
                cookie_map.insert(name, val);
            }
        }

        if !cookie_map.is_empty() {
            let cookie_str = cookie_map
                .into_iter()
                .map(|(k, v)| format!("{}={}", k, v))
                .collect::<Vec<_>>()
                .join("; ");
            results.insert(domain.to_string(), cookie_str);
        }
    }

    Ok(results)
}
