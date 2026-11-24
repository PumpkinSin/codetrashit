use crate::config::AppConfig;
use crate::cookie::{extract_cookies, list_available_browsers, BrowserInfo};
use crate::fetcher;
use crate::rss::generate_rss;
use crate::storage::{DataStore, DynamicItem};
use crate::uploader::upload_r2;
use axum::extract::{Path, State};
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use std::time::Instant;
use tower_http::cors::{Any, CorsLayer};
use tracing::{error, info};

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Mutex<AppConfig>>,
    pub store: DataStore,
    pub start_time: Instant,
    pub logs: Arc<Mutex<VecDeque<String>>>,
}

pub fn push_log(state: &AppState, msg: String) {
    if let Ok(mut logs) = state.logs.lock() {
        if logs.len() >= 500 {
            logs.pop_front();
        }
        logs.push_back(msg);
    }
}

pub fn create_router(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        .route("/api/status", get(get_status))
        .route("/api/fetch", post(post_fetch))
        .route("/api/douban/refresh-following", post(post_douban_refresh_following))
        .route("/api/sync", post(post_sync))
        .route("/api/feed/:platform", get(get_feed))
        .route("/api/data/:platform", get(get_data))
        .route("/api/feed", post(post_feed))
        .route("/api/cookies/browsers", get(get_browsers))
        .route("/api/cookies/extract", post(post_extract_cookies))
        .route("/api/cookies/save", post(post_save_cookie))
        .route("/api/config", get(get_config))
        .route("/api/config/keywords", post(post_keywords))
        .route("/api/config/settings", post(post_settings))
        .route("/api/logs", get(get_logs))
        .layer(cors)
        .with_state(state)
}

async fn get_status(State(state): State<AppState>) -> Json<Value> {
    let cfg = state.config.lock().unwrap().clone();
    let uptime = state.start_time.elapsed().as_secs();

    let bilibili_count = state.store.load("bilibili").len();
    let zhihu_count = state.store.load("zhihu").len();
    let bilibili_alt_count = state.store.load("bilibili-alt").len();
    let douban_count = state.store.load("douban").len();

    let r2_configured = !cfg.r2.account_id.is_empty() && !cfg.r2.access_key_id.is_empty();

    Json(json!({
        "online": true,
        "uptime": uptime,
        "r2Configured": r2_configured,
        "autoSync": cfg.auto_sync,
        "fetch": {
            "bilibili": !cfg.bilibili.cookie.is_empty() || !cfg.bilibili.sessdata.is_empty(),
            "bilibiliAlt": !cfg.bilibili_alt.cookie.is_empty() || !cfg.bilibili_alt.sessdata.is_empty(),
            "zhihu": !cfg.zhihu.cookie.is_empty(),
            "douban": !cfg.douban.cookie.is_empty(),
            "intervalMinutes": cfg.fetch.interval_minutes,
        },
        "data": {
            "bilibili": bilibili_count,
            "zhihu": zhihu_count,
            "bilibili-alt": bilibili_alt_count,
            "douban": douban_count,
        }
    }))
}

async fn post_fetch(State(state): State<AppState>) -> Json<Value> {
    info!("[Server] 手动触发抓取任务...");
    let env_path = std::path::Path::new(".env");
    if env_path.exists() {
        let new_cfg = AppConfig::load_from_env_file(env_path);
        *state.config.lock().unwrap() = new_cfg;
    }
    let cfg = state.config.lock().unwrap().clone();
    let store = state.store.clone();
    let config_arc = state.config.clone();

    tokio::spawn(async move {
        let _ = fetcher::run_all_fetchers(&cfg, &store).await;
        let env_path = std::path::Path::new(".env");
        if env_path.exists() {
            let new_cfg = AppConfig::load_from_env_file(env_path);
            *config_arc.lock().unwrap() = new_cfg;
        }
    });

    Json(json!({ "success": true, "message": "抓取任务已启动" }))
}

async fn post_douban_refresh_following(State(state): State<AppState>) -> Json<Value> {
    info!("[Server] 手动刷新豆瓣关注列表...");
    let env_path = std::path::Path::new(".env");
    if env_path.exists() {
        let new_cfg = AppConfig::load_from_env_file(env_path);
        *state.config.lock().unwrap() = new_cfg;
    }
    let cfg = state.config.lock().unwrap().clone();

    match fetcher::douban::refresh_following_cache(&cfg).await {
        Ok(count) => {
            info!("[Server] 豆瓣关注列表已刷新，共 {} 人", count);
            Json(json!({ "success": true, "count": count }))
        }
        Err(e) => {
            error!("[Server] 刷新豆瓣关注列表失败: {}", e);
            Json(json!({ "success": false, "error": e }))
        }
    }
}

async fn post_sync(State(state): State<AppState>) -> Json<Value> {    info!("[Server] 手动触发 R2 同步...");
    let env_path = std::path::Path::new(".env");
    if env_path.exists() {
        let new_cfg = AppConfig::load_from_env_file(env_path);
        *state.config.lock().unwrap() = new_cfg;
    }
    let cfg = state.config.lock().unwrap().clone();
    let store = state.store.clone();

    let mut results = json!({});

    for platform in ["bilibili", "zhihu", "douban"] {
        let items = store.load(platform);
        if !items.is_empty() {
            let xml = generate_rss(&cfg, platform, &items);
            let key = match platform {
                "bilibili" => &cfg.rss.bilibili_key,
                "zhihu" => &cfg.rss.zhihu_key,
                "douban" => &cfg.rss.douban_key,
                _ => "",
            };
            match upload_r2(&cfg, key, &xml).await {
                Ok(url) => {
                    results[platform] = json!({ "success": true, "url": url });
                }
                Err(e) => {
                    results[platform] = json!({ "success": false, "error": e.to_string() });
                }
            }
        }
    }

    Json(json!({ "success": true, "results": results }))
}

async fn get_feed(Path(platform): Path<String>, State(state): State<AppState>) -> Response {
    if !["bilibili", "zhihu", "bilibili-alt", "douban"].contains(&platform.as_str()) {
        return (StatusCode::BAD_REQUEST, "不支持的平台").into_response();
    }

    let cfg = state.config.lock().unwrap().clone();
    let items = state.store.load(&platform);
    let xml = generate_rss(&cfg, &platform, &items);

    ([(header::CONTENT_TYPE, "application/rss+xml; charset=utf-8")], xml).into_response()
}

async fn get_data(Path(platform): Path<String>, State(state): State<AppState>) -> Json<Value> {
    if !["bilibili", "zhihu", "bilibili-alt", "douban"].contains(&platform.as_str()) {
        return Json(json!({ "code": 1, "error": "不支持的平台" }));
    }

    let items = state.store.load(&platform);
    Json(json!({
        "code": 0,
        "data": items,
        "total": items.len()
    }))
}

#[derive(Deserialize)]
struct ExternalFeedPayload {
    platform: String,
    items: Vec<DynamicItem>,
}

async fn post_feed(State(state): State<AppState>, Json(payload): Json<ExternalFeedPayload>) -> Json<Value> {
    let platform = payload.platform;
    if !["bilibili", "zhihu", "bilibili-alt", "douban"].contains(&platform.as_str()) {
        return Json(json!({ "success": false, "error": "不支持的平台" }));
    }

    let cfg = state.config.lock().unwrap().clone();
    let max_items = if platform == "bilibili-alt" {
        cfg.bilibili_alt.max_items
    } else {
        cfg.rss.max_items
    };

    let result = state.store.merge(&platform, payload.items, max_items);
    Json(json!({
        "success": true,
        "totalCount": result.total_count,
        "newCount": result.new_count
    }))
}

async fn get_browsers() -> Json<Vec<BrowserInfo>> {
    Json(list_available_browsers())
}

#[derive(Deserialize)]
struct ExtractCookiePayload {
    #[serde(rename = "browserType")]
    browser_type: String,
    #[serde(rename = "profilePath")]
    profile_path: String,
    domains: Vec<String>,
}

async fn post_extract_cookies(
    State(state): State<AppState>,
    Json(payload): Json<ExtractCookiePayload>,
) -> Json<Value> {
    let profile_p = std::path::Path::new(&payload.profile_path);
    let domain_refs: Vec<&str> = payload.domains.iter().map(|s| s.as_str()).collect();

    match extract_cookies(&payload.browser_type, profile_p, &domain_refs) {
        Ok(cookies) => {
            let env_path = std::path::Path::new(".env");
            for (domain, val) in &cookies {
                let key = match domain.as_str() {
                    "bilibili.com" => {
                        for part in val.split(';') {
                            let part = part.trim();
                            if let Some(s) = part.strip_prefix("SESSDATA=") {
                                let _ = AppConfig::save_key_to_env(env_path, "BILIBILI_SESSDATA", s);
                            }
                        }
                        "BILIBILI_COOKIE"
                    }
                    "zhihu.com" => "ZHIHU_COOKIE",
                    "douban.com" => "DOUBAN_COOKIE",
                    _ => continue,
                };
                let _ = AppConfig::save_key_to_env(env_path, key, val);
            }
            // Reload config
            let new_cfg = AppConfig::load_from_env_file(env_path);
            *state.config.lock().unwrap() = new_cfg;

            Json(json!({
                "success": true,
                "cookies": cookies
            }))
        }
        Err(e) => {
            error!("[Cookie] 提取失败: {}", e);
            Json(json!({ "success": false, "error": e.to_string() }))
        }
    }
}

#[derive(Deserialize)]
struct SaveCookiePayload {
    platform: String,
    cookie: String,
}

async fn post_save_cookie(
    State(state): State<AppState>,
    Json(payload): Json<SaveCookiePayload>,
) -> Json<Value> {
    let env_path = std::path::Path::new(".env");
    let key = match payload.platform.as_str() {
        "bilibili" | "bilibili.com" => {
            for part in payload.cookie.split(';') {
                let part = part.trim();
                if let Some(s) = part.strip_prefix("SESSDATA=") {
                    let _ = AppConfig::save_key_to_env(env_path, "BILIBILI_SESSDATA", s);
                }
            }
            "BILIBILI_COOKIE"
        }
        "bilibili-alt" => {
            for part in payload.cookie.split(';') {
                let part = part.trim();
                if let Some(s) = part.strip_prefix("SESSDATA=") {
                    let _ = AppConfig::save_key_to_env(env_path, "BILIBILI_ALT_SESSDATA", s);
                }
            }
            "BILIBILI_ALT_COOKIE"
        }
        "zhihu" | "zhihu.com" => "ZHIHU_COOKIE",
        "douban" | "douban.com" => "DOUBAN_COOKIE",
        _ => return Json(json!({ "success": false, "error": "未知平台" })),
    };

    let _ = AppConfig::save_key_to_env(env_path, key, &payload.cookie);
    let new_cfg = AppConfig::load_from_env_file(env_path);
    *state.config.lock().unwrap() = new_cfg;

    Json(json!({ "success": true }))
}

async fn get_config(State(state): State<AppState>) -> Json<Value> {
    let cfg = state.config.lock().unwrap().clone();
    Json(json!({
        "bilibili_keywords": cfg.bilibili.block_keywords,
        "bilibili_video_only": cfg.bilibili.video_only,
        "interval_minutes": cfg.fetch.interval_minutes,
        "auto_sync": cfg.auto_sync,
        "render_embed_player": cfg.render.bilibili_embed_player,
    }))
}

#[derive(Deserialize)]
struct KeywordsPayload {
    action: String, // "add" | "remove"
    keyword: String,
}

async fn post_keywords(State(state): State<AppState>, Json(payload): Json<KeywordsPayload>) -> Json<Value> {
    let env_path = std::path::Path::new(".env");
    let mut cfg = state.config.lock().unwrap().clone();

    let mut kws = cfg.bilibili.block_keywords.clone();
    if payload.action == "add" {
        if !kws.contains(&payload.keyword) {
            kws.push(payload.keyword);
        }
    } else if payload.action == "remove" {
        kws.retain(|k| k != &payload.keyword);
    }

    let joined = kws.join(",");
    let _ = AppConfig::save_key_to_env(env_path, "BILIBILI_BLOCK_KEYWORDS", &joined);

    cfg.bilibili.block_keywords = kws.clone();
    *state.config.lock().unwrap() = cfg;

    Json(json!({ "success": true, "keywords": kws }))
}

#[derive(Deserialize)]
struct SettingsPayload {
    bilibili_video_only: Option<bool>,
}

async fn post_settings(
    State(state): State<AppState>,
    Json(payload): Json<SettingsPayload>,
) -> Json<Value> {
    let env_path = std::path::Path::new(".env");
    let mut cfg = state.config.lock().unwrap().clone();

    if let Some(video_only) = payload.bilibili_video_only {
        let val = if video_only { "true" } else { "false" };
        let _ = AppConfig::save_key_to_env(env_path, "BILIBILI_VIDEO_ONLY", val);
        cfg.bilibili.video_only = video_only;
    }

    let video_only = cfg.bilibili.video_only;
    *state.config.lock().unwrap() = cfg;

    Json(json!({
        "success": true,
        "bilibili_video_only": video_only,
    }))
}

async fn get_logs(State(state): State<AppState>) -> Json<Vec<String>> {
    let logs = state.logs.lock().unwrap();
    Json(logs.iter().cloned().collect())
}
