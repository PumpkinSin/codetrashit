use crate::config::AppConfig;
use crate::storage::{DataStore, DynamicItem, DynamicStats, MergeResult, OrigDynamic};
use anyhow::Result;
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, COOKIE, REFERER, USER_AGENT};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::time::Duration;
use tracing::{info, warn};

const API_BASE: &str = "https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/all";

pub async fn fetch_and_store(
    config: &AppConfig,
    store: &DataStore,
    platform: &str,
    video_only: bool,
) -> Result<MergeResult> {
    let (cookie_val, sessdata, max_pages) = if platform == "bilibili-alt" {
        (
            &config.bilibili_alt.cookie,
            &config.bilibili_alt.sessdata,
            config.bilibili_alt.max_pages,
        )
    } else {
        (
            &config.bilibili.cookie,
            &config.bilibili.sessdata,
            config.bilibili.max_pages,
        )
    };

    let mut cookie_header = if !cookie_val.is_empty() {
        cookie_val.clone()
    } else if !sessdata.is_empty() {
        format!("SESSDATA={}", sessdata)
    } else {
        String::new()
    };

    let label = if platform == "bilibili-alt" { "B站小号" } else { "B站主号" };

    if cookie_header.is_empty() {
        info!("[BilibiliFetcher] {}: 未配置 Cookie，尝试从浏览器自动获取...", label);
        if let Some((new_cookie, source)) = crate::cookie::try_auto_refresh_cookie(platform) {
            info!("[BilibiliFetcher] {}: 成功从 {} 自动获取 Cookie！", label, source);
            cookie_header = new_cookie;
        } else {
            info!("[BilibiliFetcher] {}: 未配置 Cookie 且未能从浏览器自动获取，跳过", label);
            return Ok(MergeResult {
                total_count: store.load(platform).len(),
                new_count: 0,
            });
        }
    }

    let extra_pages = config.bilibili.extra_pages;
    info!(
        "[BilibiliFetcher] {}: 开始抓取（最多 {} 页，重叠后再爬 {} 页）...",
        label, max_pages, extra_pages
    );

    let existing_ids: HashSet<String> = store.load(platform).into_iter().map(|i| i.id).collect();

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()?;

    let mut items = Vec::new();
    let mut offset = String::new();
    let mut overlap_pages_left: i32 = -1;
    let mut has_auto_refreshed = false;

    let mut page = 0;
    while page < max_pages {
        let mut url = format!("{}?type=all&timezone_offset=-480", API_BASE);
        if !offset.is_empty() {
            url.push_str(&format!("&offset={}", urlencoding::encode(&offset)));
        }

        let mut headers = HeaderMap::new();
        headers.insert(ACCEPT, HeaderValue::from_static("application/json"));
        headers.insert(REFERER, HeaderValue::from_static("https://www.bilibili.com/"));
        headers.insert(
            USER_AGENT,
            HeaderValue::from_static(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0",
            ),
        );
        if let Ok(hv) = HeaderValue::from_str(&cookie_header) {
            headers.insert(COOKIE, hv);
        }

        let resp = match client.get(&url).headers(headers).send().await {
            Ok(r) => r,
            Err(e) => {
                warn!("[BilibiliFetcher] {}: 请求异常: {}", label, e);
                break;
            }
        };

        let status = resp.status();
        let is_http_err = !status.is_success();

        let json: Value = if is_http_err {
            serde_json::json!({})
        } else {
            match resp.json().await {
                Ok(j) => j,
                Err(e) => {
                    warn!("[BilibiliFetcher] {}: 解析 JSON 失败: {}", label, e);
                    break;
                }
            }
        };

        let code = json.get("code").and_then(|c| c.as_i64()).unwrap_or(0);
        let is_auth_err = is_http_err || code == -101 || (page == 0 && code != 0);

        if is_auth_err {
            let msg = json.get("message").and_then(|m| m.as_str()).unwrap_or("");
            warn!("[BilibiliFetcher] {}: 抓取失败或鉴权失效 (HTTP {}, code: {}, msg: '{}')", label, status, code, msg);

            if !has_auto_refreshed {
                has_auto_refreshed = true;
                info!("[BilibiliFetcher] {}: 正在尝试从浏览器重新获取 Cookie 并重试...", label);
                if let Some((new_cookie, source)) = crate::cookie::try_auto_refresh_cookie(platform) {
                    info!("[BilibiliFetcher] {}: 已从 {} 获取新 Cookie，立即重试当前请求...", label, source);
                    cookie_header = new_cookie;
                    continue; // Retry current page
                }
            }
            break;
        }

        let dynamic_items = match json.pointer("/data/items").and_then(|i| i.as_array()) {
            Some(arr) if !arr.is_empty() => arr,
            _ => break,
        };

        let mut page_new_count = 0;
        let mut page_total_count = 0;

        for item in dynamic_items {
            let item_type = item.get("type").and_then(|t| t.as_str()).unwrap_or("");
            if video_only && item_type != "DYNAMIC_TYPE_AV" {
                continue;
            }

            if !config.bilibili.skip_types.is_empty() && config.bilibili.skip_types.iter().any(|t| t == item_type) {
                continue;
            }

            if let Some(normalized) = normalize_dynamic(item, platform) {
                if is_bilibili_item_blocked(&normalized, &config.bilibili.block_keywords) {
                    info!("[BilibiliFetcher] 关键词过滤: \"{}...\"", normalized.title.chars().take(40).collect::<String>());
                    continue;
                }

                page_total_count += 1;
                if !existing_ids.contains(&normalized.id) {
                    page_new_count += 1;
                }
                items.push(normalized);
            }
        }

        if overlap_pages_left < 0 && page_total_count > 0 && page_new_count < page_total_count / 2 {
            overlap_pages_left = extra_pages as i32;
            info!(
                "[BilibiliFetcher] {}: 第 {} 页检测到重叠（{}/{} 新），再爬 {} 页",
                label, page + 1, page_new_count, page_total_count, extra_pages
            );
        }

        if overlap_pages_left >= 0 {
            if overlap_pages_left <= 0 {
                info!("[BilibiliFetcher] {}: 额外页数已用完，停止", label);
                break;
            }
            overlap_pages_left -= 1;
        }

        offset = json.pointer("/data/offset").and_then(|o| o.as_str()).unwrap_or("").to_string();
        let has_more = json.pointer("/data/has_more").and_then(|h| h.as_bool()).unwrap_or(false);
        if !has_more {
            break;
        }

        let delay_ms = 8000 + (rand::random::<u64>() % 7000);
        tokio::time::sleep(Duration::from_millis(delay_ms)).await;
        page += 1;
    }

    if items.is_empty() {
        info!("[BilibiliFetcher] {}: 无新数据", label);
        return Ok(MergeResult {
            total_count: store.load(platform).len(),
            new_count: 0,
        });
    }

    let max_items = if platform == "bilibili-alt" {
        config.bilibili_alt.max_items
    } else {
        config.rss.max_items
    };

    let result = store.merge(platform, items.clone(), max_items);
    info!("[BilibiliFetcher] {}: 抓取 {} 条，新增 {} 条", label, items.len(), result.new_count);

    // Auto extract video for bilibili-alt if alt has no custom cookie
    if platform == "bilibili" && config.bilibili_alt.cookie.is_empty() && config.bilibili_alt.sessdata.is_empty() {
        let video_items: Vec<DynamicItem> = items.into_iter().filter(|i| i.item_type == "DYNAMIC_TYPE_AV").collect();
        if !video_items.is_empty() {
            let alt_res = store.merge("bilibili-alt", video_items, config.bilibili_alt.max_items);
            info!("[BilibiliFetcher] 自动提取视频 → bilibili-alt（新增 {}）", alt_res.new_count);
        }
    }

    Ok(result)
}

fn normalize_dynamic(item: &Value, platform: &str) -> Option<DynamicItem> {
    let modules = item.get("modules")?;
    let author_mod = modules.get("module_author");
    let dynamic_mod = modules.get("module_dynamic");
    let stat_mod = modules.get("module_stat");

    let author = author_mod.and_then(|a| a.get("name")).and_then(|n| n.as_str()).unwrap_or("未知作者").to_string();
    let author_face = author_mod.and_then(|a| a.get("face")).and_then(|f| f.as_str()).unwrap_or("").to_string();
    let author_mid = author_mod.and_then(|a| a.get("mid")).map(|m| m.to_string());
    let pub_ts = author_mod.and_then(|a| a.get("pub_ts")).and_then(|t| t.as_i64()).unwrap_or(0);
    let dynamic_id = item.get("id_str").and_then(|i| i.as_str()).unwrap_or("").to_string();
    let dynamic_type = item.get("type").and_then(|t| t.as_str()).unwrap_or("").to_string();

    let extracted = extract_content(item, &dynamic_type, dynamic_mod);
    let title = build_title(&author, &dynamic_type, &extracted.title);
    let emojis = extract_emojis(dynamic_mod);

    let stats = DynamicStats {
        like: stat_mod.and_then(|s| s.pointer("/like/count")).and_then(|c| c.as_u64()).unwrap_or(0),
        view: stat_mod.and_then(|s| s.pointer("/comment/count")).and_then(|c| c.as_u64()).unwrap_or(0),
        comment: stat_mod.and_then(|s| s.pointer("/comment/count")).and_then(|c| c.as_u64()).unwrap_or(0),
        forward: stat_mod.and_then(|s| s.pointer("/forward/count")).and_then(|c| c.as_u64()).unwrap_or(0),
        danmaku: 0,
        reshare: 0,
    };

    let link = if !extracted.link.is_empty() {
        extracted.link
    } else {
        format!("https://www.bilibili.com/opus/{}", dynamic_id)
    };

    Some(DynamicItem {
        id: dynamic_id,
        platform: platform.to_string(),
        item_type: dynamic_type,
        author,
        author_face,
        author_mid,
        author_url: None,
        title,
        raw_title: extracted.title,
        content: extracted.content,
        link,
        images: extracted.images,
        video_cover: extracted.video_cover,
        video_duration: extracted.video_duration,
        video_bvid: extracted.video_bvid,
        emojis,
        orig_dynamic: extracted.orig_dynamic.map(Box::new),
        publish_time: pub_ts * 1000,
        stats,
    })
}

struct ExtractedContent {
    title: String,
    content: String,
    link: String,
    images: Vec<String>,
    video_cover: String,
    video_duration: String,
    video_bvid: String,
    orig_dynamic: Option<OrigDynamic>,
}

fn format_bili_url(url: &str) -> String {
    let u = url.trim();
    if u.is_empty() {
        return String::new();
    }
    if u.starts_with("//") {
        format!("https:{}", u)
    } else if u.starts_with('/') {
        format!("https://www.bilibili.com{}", u)
    } else {
        u.to_string()
    }
}

fn extract_content(item: &Value, dynamic_type: &str, dynamic_mod: Option<&Value>) -> ExtractedContent {
    let major = dynamic_mod.and_then(|d| d.get("major"));
    let desc = dynamic_mod.and_then(|d| d.get("desc"));

    let mut title = String::new();
    let mut content = desc.and_then(|d| d.get("text")).and_then(|t| t.as_str()).unwrap_or("").to_string();
    let mut link = String::new();
    let mut images = Vec::new();
    let mut video_cover = String::new();
    let mut video_duration = String::new();
    let mut video_bvid = String::new();
    let mut orig_dynamic = None;

    match dynamic_type {
        "DYNAMIC_TYPE_AV" => {
            if let Some(archive) = major.and_then(|m| m.get("archive")) {
                title = archive.get("title").and_then(|t| t.as_str()).unwrap_or("").to_string();
                if let Some(d) = archive.get("desc").and_then(|d| d.as_str()) {
                    content = d.to_string();
                }
                if let Some(jump) = archive.get("jump_url").and_then(|j| j.as_str()) {
                    link = format_bili_url(jump);
                    if let Some(pos) = jump.find("/BV") {
                        let bv_part = &jump[pos + 1..];
                        let bv_token: String = bv_part.chars().take_while(|c| c.is_alphanumeric()).collect();
                        video_bvid = bv_token;
                    }
                }
                video_cover = archive.get("cover").and_then(|c| c.as_str()).unwrap_or("").to_string();
                video_duration = archive.get("duration_text").and_then(|d| d.as_str()).unwrap_or("").to_string();
                if let Some(bvid) = archive.get("bvid").and_then(|b| b.as_str()) {
                    video_bvid = bvid.to_string();
                }
            }
        }
        "DYNAMIC_TYPE_OPUS" => {
            if let Some(opus) = major.and_then(|m| m.get("opus")) {
                if let Some(t) = opus.get("title").and_then(|t| t.as_str()) {
                    if !t.is_empty() {
                        title = t.to_string();
                    }
                }
                if content.is_empty() {
                    if let Some(txt) = opus.pointer("/summary/text").and_then(|t| t.as_str()) {
                        content = txt.to_string();
                    }
                }
                if let Some(j) = opus.get("jump_url").and_then(|j| j.as_str()) {
                    link = format_bili_url(j);
                }
                if let Some(pics) = opus.get("pics").and_then(|p| p.as_array()) {
                    for p in pics {
                        if let Some(url) = p.get("url").and_then(|u| u.as_str()) {
                            images.push(url.to_string());
                        }
                    }
                }
            }
        }
        "DYNAMIC_TYPE_DRAW" => {
            if let Some(draw) = major.and_then(|m| m.get("draw")) {
                if let Some(items_arr) = draw.get("items").and_then(|i| i.as_array()) {
                    for it in items_arr {
                        if let Some(src) = it.get("src").and_then(|s| s.as_str()) {
                            images.push(src.to_string());
                        }
                    }
                }
            }
            if content.is_empty() {
                if let Some(txt) = major.and_then(|m| m.pointer("/opus/summary/text")).and_then(|t| t.as_str()) {
                    content = txt.to_string();
                }
            }
        }
        "DYNAMIC_TYPE_ARTICLE" => {
            if let Some(art) = major.and_then(|m| m.get("article")) {
                title = art.get("title").and_then(|t| t.as_str()).unwrap_or("").to_string();
                if let Some(j) = art.get("jump_url").and_then(|j| j.as_str()) {
                    link = format_bili_url(j);
                }
                if let Some(covers) = art.get("covers").and_then(|c| c.as_array()) {
                    for c in covers {
                        if let Some(src) = c.as_str() {
                            images.push(src.to_string());
                        }
                    }
                }
            }
        }
        "DYNAMIC_TYPE_FORWARD" => {
            if let Some(orig) = item.get("orig") {
                let orig_mod = orig.get("modules");
                let orig_author = orig_mod.and_then(|m| m.pointer("/module_author/name")).and_then(|n| n.as_str()).unwrap_or("未知").to_string();
                let orig_face = orig_mod.and_then(|m| m.pointer("/module_author/face")).and_then(|f| f.as_str()).unwrap_or("").to_string();
                let orig_dyn_mod = orig_mod.and_then(|m| m.get("module_dynamic"));
                let orig_type = orig.get("type").and_then(|t| t.as_str()).unwrap_or("").to_string();
                let orig_ext = extract_content(orig, &orig_type, orig_dyn_mod);
                let orig_emojis = extract_emojis(orig_dyn_mod);

                if !orig_ext.link.is_empty() {
                    link = orig_ext.link.clone();
                }

                orig_dynamic = Some(OrigDynamic {
                    item_type: orig_type,
                    author: orig_author,
                    author_face: orig_face,
                    title: orig_ext.title,
                    content: orig_ext.content,
                    link: orig_ext.link,
                    images: orig_ext.images,
                    video_cover: orig_ext.video_cover,
                    video_duration: orig_ext.video_duration,
                    video_bvid: orig_ext.video_bvid,
                    emojis: orig_emojis,
                });
            }
        }
        "DYNAMIC_TYPE_LIVE_RCMD" | "DYNAMIC_TYPE_LIVE" => {
            let live_info: Option<Value> = if let Some(live) = major.and_then(|m| m.get("live_rcmd")).or_else(|| major.and_then(|m| m.get("live"))) {
                if let Some(content_str) = live.get("content").and_then(|c| c.as_str()) {
                    serde_json::from_str::<Value>(content_str).ok().and_then(|v| v.get("live_play_info").cloned())
                } else if let Some(info) = live.get("live_play_info") {
                    Some(info.clone())
                } else {
                    None
                }
            } else {
                None
            };

            if let Some(info) = live_info {
                title = info.get("title").and_then(|t| t.as_str()).unwrap_or("正在直播").to_string();
                let area = info.get("area_name").and_then(|a| a.as_str()).unwrap_or("");
                let watched = info.pointer("/watched_show/text_large").and_then(|w| w.as_str()).unwrap_or("");
                let mut parts = vec!["🔴 直播中".to_string()];
                if !area.is_empty() {
                    parts.push(format!("分区: {}", area));
                }
                if !watched.is_empty() {
                    parts.push(watched.to_string());
                }
                content = parts.join(" | ");
                if let Some(j) = info.get("link").and_then(|l| l.as_str()) {
                    link = format_bili_url(j);
                }
                if let Some(c) = info.get("cover").and_then(|c| c.as_str()) {
                    video_cover = c.to_string();
                }
            } else {
                title = "正在直播".to_string();
                content = "🔴 直播中".to_string();
            }
        }
        "DYNAMIC_TYPE_PGC" => {
            if let Some(pgc) = major.and_then(|m| m.get("pgc")) {
                title = pgc.get("title").and_then(|t| t.as_str()).unwrap_or("").to_string();
                if let Some(j) = pgc.get("jump_url").and_then(|j| j.as_str()) {
                    link = format_bili_url(j);
                }
                if let Some(c) = pgc.get("cover").and_then(|c| c.as_str()) {
                    video_cover = c.to_string();
                }
            }
        }
        "DYNAMIC_TYPE_COURSES" => {
            if let Some(courses) = major.and_then(|m| m.get("courses")) {
                title = courses.get("title").and_then(|t| t.as_str()).unwrap_or("").to_string();
                if let Some(sub) = courses.get("sub_title").and_then(|s| s.as_str()) {
                    content = sub.to_string();
                }
                if let Some(j) = courses.get("jump_url").and_then(|j| j.as_str()) {
                    link = format_bili_url(j);
                }
                if let Some(c) = courses.get("cover").and_then(|c| c.as_str()) {
                    video_cover = c.to_string();
                }
            }
        }
        "DYNAMIC_TYPE_COMMON" => {
            if let Some(common) = major.and_then(|m| m.get("common")) {
                title = common.get("title").and_then(|t| t.as_str()).unwrap_or("").to_string();
                if let Some(d) = common.get("desc").and_then(|d| d.as_str()) {
                    content = d.to_string();
                }
                if let Some(j) = common.get("jump_url").and_then(|j| j.as_str()) {
                    link = format_bili_url(j);
                }
                if let Some(c) = common.get("cover").and_then(|c| c.as_str()) {
                    video_cover = c.to_string();
                }
            }
        }
        _ => {}
    }

    // Fallback: If images are empty, check if major.opus.pics has images
    if images.is_empty() {
        if let Some(pics) = major.and_then(|m| m.pointer("/opus/pics")).and_then(|p| p.as_array()) {
            for p in pics {
                if let Some(url) = p.get("url").and_then(|u| u.as_str()) {
                    images.push(url.to_string());
                }
            }
        } else if let Some(items_arr) = major.and_then(|m| m.pointer("/draw/items")).and_then(|i| i.as_array()) {
            for it in items_arr {
                if let Some(src) = it.get("src").and_then(|s| s.as_str()) {
                    images.push(src.to_string());
                }
            }
        }
    }

    // Fallback: If content is empty, check major.opus.summary.text
    if content.is_empty() {
        if let Some(txt) = major.and_then(|m| m.pointer("/opus/summary/text")).and_then(|t| t.as_str()) {
            content = txt.to_string();
        }
    }

    // Fallback: If title is empty, check major.opus.title
    if title.is_empty() {
        if let Some(t) = major.and_then(|m| m.pointer("/opus/title")).and_then(|t| t.as_str()) {
            title = t.to_string();
        }
    }

    // Extract additional modules (e.g. goods)
    if let Some(add) = dynamic_mod.and_then(|d| d.get("additional")) {
        let add_type = add.get("type").and_then(|t| t.as_str()).unwrap_or("");
        if add_type == "ADDITIONAL_TYPE_GOODS" {
            if let Some(items) = add.pointer("/goods/items").and_then(|i| i.as_array()) {
                let goods_titles: Vec<&str> = items.iter().filter_map(|g| g.get("name").and_then(|n| n.as_str())).collect();
                if !goods_titles.is_empty() {
                    let goods_info = format!("🛍️ 关联商品: {}", goods_titles.join(" / "));
                    if content.is_empty() {
                        content = goods_info;
                    } else {
                        content = format!("{}\n\n{}", content, goods_info);
                    }
                }
            }
        }
    }

    ExtractedContent {
        title,
        content,
        link,
        images,
        video_cover,
        video_duration,
        video_bvid,
        orig_dynamic,
    }
}

fn build_title(author: &str, dynamic_type: &str, content_title: &str) -> String {
    let t = content_title.trim();
    match dynamic_type {
        "DYNAMIC_TYPE_AV" => {
            if !t.is_empty() { format!("{} 投稿了视频：{}", author, t) } else { format!("{} 投稿了视频", author) }
        }
        "DYNAMIC_TYPE_DRAW" | "DYNAMIC_TYPE_OPUS" => {
            if !t.is_empty() { format!("{} 发布了图文：{}", author, t) } else { format!("{} 发布了图文动态", author) }
        }
        "DYNAMIC_TYPE_ARTICLE" => {
            if !t.is_empty() { format!("{} 发表了专栏文章：{}", author, t) } else { format!("{} 发表了专栏文章", author) }
        }
        "DYNAMIC_TYPE_WORD" => format!("{} 发布了动态", author),
        "DYNAMIC_TYPE_FORWARD" => format!("{} 转发了动态", author),
        "DYNAMIC_TYPE_LIVE_RCMD" | "DYNAMIC_TYPE_LIVE" => {
            if !t.is_empty() { format!("{} 正在直播：{}", author, t) } else { format!("{} 正在直播", author) }
        }
        "DYNAMIC_TYPE_MUSIC" => {
            if !t.is_empty() { format!("{} 发布了音频：{}", author, t) } else { format!("{} 发布了音频", author) }
        }
        "DYNAMIC_TYPE_PGC" => {
            if !t.is_empty() { format!("{} 分享了番剧：{}", author, t) } else { format!("{} 分享了番剧", author) }
        }
        "DYNAMIC_TYPE_COURSES" => {
            if !t.is_empty() { format!("{} 更新了课程：{}", author, t) } else { format!("{} 更新了课程", author) }
        }
        _ => {
            if !t.is_empty() { format!("{}：{}", author, t) } else { format!("{} 的动态", author) }
        }
    }
}

fn extract_emojis(dynamic_mod: Option<&Value>) -> HashMap<String, String> {
    let mut emojis = HashMap::new();
    let nodes = match dynamic_mod.and_then(|d| d.pointer("/desc/rich_text_nodes")).and_then(|n| n.as_array()) {
        Some(arr) => arr,
        None => return emojis,
    };

    for node in nodes {
        let node_type = node.get("type").and_then(|t| t.as_str()).unwrap_or("");
        if node_type == "RICH_TEXT_NODE_TYPE_EMOJI" {
            let text = node.get("text").and_then(|t| t.as_str());
            let icon_url = node.pointer("/emoji/icon_url").and_then(|u| u.as_str());
            if let (Some(k), Some(v)) = (text, icon_url) {
                emojis.insert(k.to_string(), v.to_string());
            }
        }
    }
    emojis
}

/// Returns true if a Bilibili dynamic item matches any block keyword.
/// Only applies to non-video items (`item_type != "DYNAMIC_TYPE_AV"`), so videos are never blocked.
pub fn is_bilibili_item_blocked(item: &DynamicItem, block_keywords: &[String]) -> bool {
    if block_keywords.is_empty() || item.item_type == "DYNAMIC_TYPE_AV" {
        return false;
    }

    let mut text = format!("{} {} {}", item.title, item.raw_title, item.content);
    if let Some(orig) = &item.orig_dynamic {
        text.push(' ');
        text.push_str(&orig.title);
        text.push(' ');
        text.push_str(&orig.content);
    }
    let text_lower = text.to_lowercase();

    block_keywords
        .iter()
        .map(|kw| kw.trim())
        .filter(|kw| !kw.is_empty())
        .any(|kw| text_lower.contains(&kw.to_lowercase()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_item(item_type: &str, title: &str, content: &str) -> DynamicItem {
        DynamicItem {
            id: "1".to_string(),
            platform: "bilibili".to_string(),
            item_type: item_type.to_string(),
            author: "UP".to_string(),
            author_face: String::new(),
            author_mid: None,
            author_url: None,
            title: title.to_string(),
            raw_title: title.to_string(),
            content: content.to_string(),
            link: String::new(),
            images: vec![],
            video_cover: String::new(),
            video_duration: String::new(),
            video_bvid: String::new(),
            emojis: HashMap::new(),
            orig_dynamic: None,
            publish_time: 0,
            stats: DynamicStats::default(),
        }
    }

    #[test]
    fn test_block_keywords_skip_videos_and_block_opus() {
        let kws = vec!["外卖".to_string(), "Promo".to_string()];
        let video = make_item("DYNAMIC_TYPE_AV", "UP 投稿了视频：外卖测评", "外卖红包");
        assert!(!is_bilibili_item_blocked(&video, &kws));

        let opus = make_item("DYNAMIC_TYPE_OPUS", "UP 发布了图文动态", "点击领外卖红包");
        assert!(is_bilibili_item_blocked(&opus, &kws));

        let draw = make_item("DYNAMIC_TYPE_DRAW", "UP 发布了图文动态", "PROMO code");
        assert!(is_bilibili_item_blocked(&draw, &kws));

        let article = make_item("DYNAMIC_TYPE_ARTICLE", "UP 发表了专栏文章：外卖优惠", "");
        assert!(is_bilibili_item_blocked(&article, &kws));
    }

    #[test]
    fn test_block_keywords_match_forwarded_orig_dynamic() {
        let kws = vec!["红包".to_string()];
        let mut forward = make_item("DYNAMIC_TYPE_FORWARD", "UP 转发了动态", "快冲");
        forward.orig_dynamic = Some(Box::new(OrigDynamic {
            item_type: "DYNAMIC_TYPE_OPUS".to_string(),
            author: "原UP".to_string(),
            author_face: String::new(),
            title: "领20支付红包教程".to_string(),
            content: String::new(),
            link: String::new(),
            images: vec![],
            video_cover: String::new(),
            video_duration: String::new(),
            video_bvid: String::new(),
            emojis: HashMap::new(),
        }));
        assert!(is_bilibili_item_blocked(&forward, &kws));
    }

    #[test]
    fn test_block_keywords_empty_or_whitespace() {
        let kws = vec!["  ".to_string(), "".to_string()];
        let opus = make_item("DYNAMIC_TYPE_OPUS", "普通图文", "普通内容");
        assert!(!is_bilibili_item_blocked(&opus, &kws));
    }
}
