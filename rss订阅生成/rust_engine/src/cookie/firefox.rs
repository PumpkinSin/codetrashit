use super::chromium::BrowserProfile;
use rusqlite::Connection;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

pub fn get_firefox_profiles(browser_name: &str) -> Vec<BrowserProfile> {
    let app_data = match std::env::var("APPDATA") {
        Ok(v) => PathBuf::from(v),
        Err(_) => return Vec::new(),
    };

    let base = match browser_name {
        "Firefox" => app_data.join("Mozilla").join("Firefox").join("Profiles"),
        "Zen" => app_data.join("zen").join("Profiles"),
        _ => return Vec::new(),
    };

    if !base.exists() {
        return Vec::new();
    }

    let mut profiles = Vec::new();
    if let Ok(entries) = fs::read_dir(&base) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() && path.join("cookies.sqlite").exists() {
                profiles.push(BrowserProfile {
                    label: entry.file_name().to_string_lossy().to_string(),
                    profile_dir: path,
                });
            }
        }
    }
    profiles.sort_by(|a, b| a.label.cmp(&b.label));
    profiles
}

pub fn read_firefox_cookies(profile_dir: &Path, domains: &[&str]) -> anyhow::Result<HashMap<String, String>> {
    let db = profile_dir.join("cookies.sqlite");
    if !db.exists() {
        return Ok(HashMap::new());
    }

    let temp_file = tempfile::Builder::new().suffix(".db").tempfile()?;
    fs::copy(&db, temp_file.path())?;

    let conn = Connection::open_with_flags(
        temp_file.path(),
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_URI,
    )?;

    let mut results = HashMap::new();

    for domain in domains {
        let dot_domain = format!(".{}", domain);
        let mut stmt = conn.prepare(
            "SELECT name, value FROM moz_cookies WHERE host = ?1 OR host = ?2",
        )?;

        let mut cookie_map: HashMap<String, String> = HashMap::new();

        let rows = stmt.query_map([*domain, &dot_domain], |row| {
            let name: String = row.get(0)?;
            let value: String = row.get(1)?;
            Ok((name, value))
        })?;

        for row in rows.flatten() {
            let (name, val) = row;
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
