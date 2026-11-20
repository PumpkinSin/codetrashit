pub mod chromium;
pub mod firefox;

pub use chromium::{get_chromium_profiles, read_chromium_cookies, BrowserProfile};
pub use firefox::{get_firefox_profiles, read_firefox_cookies};

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserInfo {
    pub name: String,
    pub browser_type: String, // "chromium" | "firefox"
    pub profiles: Vec<ProfileInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileInfo {
    pub label: String,
    pub path: String,
}

pub fn list_available_browsers() -> Vec<BrowserInfo> {
    let mut list = Vec::new();

    let chromium_names = ["Chrome", "Edge", "Vivaldi"];
    for name in chromium_names {
        let profiles = get_chromium_profiles(name);
        if !profiles.is_empty() {
            list.push(BrowserInfo {
                name: name.to_string(),
                browser_type: "chromium".to_string(),
                profiles: profiles
                    .into_iter()
                    .map(|p| ProfileInfo {
                        label: p.label,
                        path: p.profile_dir.to_string_lossy().to_string(),
                    })
                    .collect(),
            });
        }
    }

    let firefox_names = ["Firefox", "Zen"];
    for name in firefox_names {
        let profiles = get_firefox_profiles(name);
        if !profiles.is_empty() {
            list.push(BrowserInfo {
                name: name.to_string(),
                browser_type: "firefox".to_string(),
                profiles: profiles
                    .into_iter()
                    .map(|p| ProfileInfo {
                        label: p.label,
                        path: p.profile_dir.to_string_lossy().to_string(),
                    })
                    .collect(),
            });
        }
    }

    list
}

pub fn extract_cookies(browser_type: &str, profile_path: &Path, domains: &[&str]) -> anyhow::Result<HashMap<String, String>> {
    if browser_type == "chromium" {
        read_chromium_cookies(profile_path, domains)
    } else {
        read_firefox_cookies(profile_path, domains)
    }
}

pub fn try_auto_refresh_cookie(platform: &str) -> Option<(String, String)> {
    use crate::config::AppConfig;
    use tracing::{info, warn};

    let domain = match platform {
        "bilibili" | "bilibili-alt" => "bilibili.com",
        "zhihu" => "zhihu.com",
        "douban" => "douban.com",
        _ => return None,
    };

    info!("[Cookie] 平台 [{}] 触发自动获取 Cookie (目标: {})...", platform, domain);

    // 1. Read preferred browser and profile from gui_config.json
    //    优先级：平台单独指定 > 全局默认 > 扫描全部浏览器
    let (platform_browser, platform_profile, global_browser, global_profile) = {
        let gui_cfg_path = Path::new("gui_config.json");
        let mut result: (Option<String>, Option<String>, Option<String>, Option<String>) = (None, None, None, None);
        if gui_cfg_path.exists() {
            if let Ok(content) = std::fs::read_to_string(gui_cfg_path) {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(enabled) = val.get("auto_refresh_cookie").and_then(|v| v.as_bool()) {
                        if !enabled {
                            info!("[Cookie] auto_refresh_cookie 被配置为禁用，跳过自动获取");
                            return None;
                        }
                    }
                    // 平台单独指定的浏览器（如：全局选 Zen，但豆瓣单独选 Chrome）
                    let pb = val
                        .get("platform_browsers")
                        .and_then(|v| v.get(domain))
                        .and_then(|v| v.as_str())
                        .filter(|s| !s.is_empty())
                        .map(ToString::to_string);
                    let pp = val
                        .get("platform_profiles")
                        .and_then(|v| v.get(domain))
                        .and_then(|v| v.as_str())
                        .filter(|s| !s.is_empty())
                        .map(ToString::to_string);
                    result.0 = pb;
                    result.1 = pp;
                    // 全局默认
                    result.2 = val.get("selected_browser").and_then(|v| v.as_str()).map(ToString::to_string);
                    result.3 = val.get("selected_profile").and_then(|v| v.as_str()).map(ToString::to_string);
                }
            }
        }
        result
    };

    let mut found_cookie: Option<String> = None;
    let mut source_name = String::new();

    // 2. Try platform-specific browser profile first, then global preferred
    let mut candidates: Vec<(Option<String>, Option<String>, &str)> = Vec::new();
    if platform_browser.is_some() {
        candidates.push((platform_browser.clone(), platform_profile.clone(), "平台指定"));
    }
    if global_browser.is_some() {
        candidates.push((global_browser.clone(), global_profile.clone(), "首选"));
    }

    'preferred: for (b_name, p_path, tag) in &candidates {
        // 通过名称在已安装浏览器中定位，确定 chromium/firefox 类型与可用 Profile
        let name = b_name.as_deref().unwrap_or_default();
        let available = list_available_browsers();
        let matched = available
            .iter()
            .find(|b| b.name.eq_ignore_ascii_case(name));
        let Some(browser) = matched else { continue };

        let profile_path = p_path
            .as_ref()
            .filter(|p| browser.profiles.iter().any(|bp| &bp.path == *p))
            .cloned()
            .or_else(|| browser.profiles.first().map(|bp| bp.path.clone()));

        let Some(profile) = profile_path else { continue };

        if let Ok(cookies) = extract_cookies(&browser.browser_type, Path::new(&profile), &[domain]) {
            if let Some(val) = cookies.get(domain) {
                if !val.trim().is_empty() {
                    found_cookie = Some(val.clone());
                    source_name = format!("{} [{}] {}", browser.name, tag, profile);
                    break 'preferred;
                }
            }
        }
    }

    // 3. Fallback: scan all available browsers and profiles
    if found_cookie.is_none() {
        let browsers = list_available_browsers();
        'outer: for b in browsers {
            for p in b.profiles {
                if Some(&b.name) == global_browser.as_ref() && Some(&p.path) == global_profile.as_ref() {
                    continue; // Already tried
                }
                let p_path_buf = Path::new(&p.path);
                if let Ok(cookies) = extract_cookies(&b.browser_type, p_path_buf, &[domain]) {
                    if let Some(val) = cookies.get(domain) {
                        if !val.trim().is_empty() {
                            found_cookie = Some(val.clone());
                            source_name = format!("{} ({})", b.name, p.label);
                            break 'outer;
                        }
                    }
                }
            }
        }
    }

    if let Some(cookie) = found_cookie {
        let env_path = Path::new(".env");
        match platform {
            "bilibili" => {
                let _ = AppConfig::save_key_to_env(env_path, "BILIBILI_COOKIE", &cookie);
                for part in cookie.split(';') {
                    let part = part.trim();
                    if let Some(sessdata) = part.strip_prefix("SESSDATA=") {
                        let _ = AppConfig::save_key_to_env(env_path, "BILIBILI_SESSDATA", sessdata);
                    }
                }
            }
            "bilibili-alt" => {
                let _ = AppConfig::save_key_to_env(env_path, "BILIBILI_ALT_COOKIE", &cookie);
                for part in cookie.split(';') {
                    let part = part.trim();
                    if let Some(sessdata) = part.strip_prefix("SESSDATA=") {
                        let _ = AppConfig::save_key_to_env(env_path, "BILIBILI_ALT_SESSDATA", sessdata);
                    }
                }
            }
            "zhihu" => {
                let _ = AppConfig::save_key_to_env(env_path, "ZHIHU_COOKIE", &cookie);
            }
            "douban" => {
                let _ = AppConfig::save_key_to_env(env_path, "DOUBAN_COOKIE", &cookie);
            }
            _ => {}
        }
        info!(
            "[Cookie] ✅ 成功从 [{}] 提取到 {} Cookie ({} 字符), 已更新至 .env",
            source_name, domain, cookie.len()
        );
        Some((cookie, source_name))
    } else {
        warn!("[Cookie] ❌ 扫描了所有浏览器，未能找到有效的 {} Cookie", domain);
        None
    }
}
