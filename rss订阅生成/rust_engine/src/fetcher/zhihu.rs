use crate::config::AppConfig;
use crate::storage::{DataStore, DynamicItem, DynamicStats, MergeResult};
use anyhow::Result;
use regex::Regex;
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, COOKIE, REFERER, USER_AGENT};
use serde_json::Value;
use std::collections::HashSet;
use std::time::Duration;
use tracing::{info, warn};

const API_BASE: &str = "https://www.zhihu.com/api/v3/moments";

pub async fn fetch_and_store(config: &AppConfig, store: &DataStore) -> Result<MergeResult> {
    let mut cookie = config.zhihu.cookie.clone();
    if cookie.is_empty() {
        info!("[ZhihuFetcher] 未配置 Cookie，尝试从浏览器自动获取...");
        if let Some((new_cookie, source)) = crate::cookie::try_auto_refresh_cookie("zhihu") {
            info!("[ZhihuFetcher] 成功从 {} 自动获取 Cookie！", source);
            cookie = new_cookie;
        } else {
            info!("[ZhihuFetcher] 未配置 Cookie 且未能从浏览器自动获取，跳过");
            return Ok(MergeResult {
                total_count: store.load("zhihu").len(),
                new_count: 0,
            });
        }
    }

    let max_pages = config.zhihu.max_pages;
    let extra_pages = config.zhihu.extra_pages;
    info!(
        "[ZhihuFetcher] 开始抓取（最多 {} 页，重叠后再爬 {} 页）...",
        max_pages, extra_pages
    );

    let existing_ids: HashSet<String> = store.load("zhihu").into_iter().map(|i| i.id).collect();

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()?;

    let mut items = Vec::new();
    let mut next_url = format!("{}?limit=10&desktop=true", API_BASE);
    let mut overlap_pages_left: i32 = -1;
    let mut has_auto_refreshed = false;

    let mut page = 0;
    while page < max_pages {
        if next_url.is_empty() {
            break;
        }

        let mut headers = HeaderMap::new();
        headers.insert(ACCEPT, HeaderValue::from_static("application/json"));
        headers.insert(REFERER, HeaderValue::from_static("https://www.zhihu.com/"));
        headers.insert(
            USER_AGENT,
            HeaderValue::from_static(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0",
            ),
        );
        headers.insert("X-Requested-With", HeaderValue::from_static("fetch"));
        if let Ok(hv) = HeaderValue::from_str(&cookie) {
            headers.insert(COOKIE, hv);
        }

        let resp = match client.get(&next_url).headers(headers).send().await {
            Ok(r) => r,
            Err(e) => {
                warn!("[ZhihuFetcher] 请求异常: {}", e);
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
                    warn!("[ZhihuFetcher] 解析 JSON 失败: {}", e);
                    break;
                }
            }
        };

        let is_auth_err = is_http_err || json.get("error").is_some() || (page == 0 && json.get("data").is_none());
        if is_auth_err {
            warn!("[ZhihuFetcher] 抓取失败或鉴权失效 (HTTP {})", status);
            if !has_auto_refreshed {
                has_auto_refreshed = true;
                info!("[ZhihuFetcher] 正在尝试从浏览器重新获取 Cookie 并重试...");
                if let Some((new_cookie, source)) = crate::cookie::try_auto_refresh_cookie("zhihu") {
                    info!("[ZhihuFetcher] 已从 {} 获取新 Cookie，立即重试当前请求...", source);
                    cookie = new_cookie;
                    continue; // Retry current page
                }
            }
            break;
        }

        let raw_moment_list = match json.get("data").and_then(|d| d.as_array()) {
            Some(arr) if !arr.is_empty() => arr,
            _ => break,
        };

        // RSSHub improvement: Flatten feed_group so folded activities are never lost
        let mut moment_list: Vec<Value> = Vec::new();
        for m in raw_moment_list {
            if m.get("type").and_then(|t| t.as_str()) == Some("feed_group") {
                if let Some(sub_list) = m.get("list").and_then(|l| l.as_array()) {
                    for sub in sub_list {
                        moment_list.push(sub.clone());
                    }
                    continue;
                }
            }
            moment_list.push(m.clone());
        }

        let mut page_new_count = 0;
        let mut page_total_count = 0;

        for moment in &moment_list {
            let verb = moment.get("verb").and_then(|v| v.as_str()).unwrap_or("");
            if verb.is_empty() {
                continue; // Skip ads
            }

            if !config.zhihu.skip_verbs.is_empty() && config.zhihu.skip_verbs.iter().any(|v| v == verb) {
                continue;
            }

            if let Some(normalized) = normalize_moment(moment) {
                page_total_count += 1;
                if !existing_ids.contains(&normalized.id) {
                    page_new_count += 1;
                }
                items.push(normalized);
            }
        }

        if overlap_pages_left < 0 && page_total_count > 0 && page_new_count == 0 {
            overlap_pages_left = extra_pages as i32;
            info!(
                "[ZhihuFetcher] 第 {} 页检测到重叠（全部 {} 条已存在），再爬 {} 页",
                page + 1, page_total_count, extra_pages
            );
        }

        if overlap_pages_left >= 0 {
            if overlap_pages_left <= 0 {
                info!("[ZhihuFetcher] 额外页数已用完，停止");
                break;
            }
            overlap_pages_left -= 1;
        }

        next_url = json.pointer("/paging/next").and_then(|n| n.as_str()).unwrap_or("").to_string();
        let is_end = json.pointer("/paging/is_end").and_then(|e| e.as_bool()).unwrap_or(false);
        if is_end {
            break;
        }

        let delay_ms = 10000 + (rand::random::<u64>() % 5000);
        tokio::time::sleep(Duration::from_millis(delay_ms)).await;
        page += 1;
    }

    if items.is_empty() {
        info!("[ZhihuFetcher] 无新数据");
        return Ok(MergeResult {
            total_count: store.load("zhihu").len(),
            new_count: 0,
        });
    }

    let result = store.merge("zhihu", items.clone(), config.rss.max_items);
    info!("[ZhihuFetcher] 抓取 {} 条，新增 {} 条", items.len(), result.new_count);
    Ok(result)
}

fn normalize_moment(moment: &Value) -> Option<DynamicItem> {
    let target = moment.get("target")?;
    let moment_type = target.get("type").and_then(|t| t.as_str()).unwrap_or("").to_string();

    let target_url = target.get("url").and_then(|u| u.as_str()).unwrap_or("");
    let source_url = target.get("source_url").and_then(|u| u.as_str()).unwrap_or("");
    if target_url.contains("zhihu.com/zhihu_") || source_url.contains("zhihu.com/zhihu_") {
        return None;
    }

    let target_id = target.get("id").map(|i| i.to_string()).unwrap_or_default();
    if target_id.contains('_') {
        return None;
    }

    // Extract actors
    let actors: Vec<String> = moment
        .get("actors")
        .and_then(|a| a.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|actor| actor.get("name").and_then(|n| n.as_str()).map(ToString::to_string))
                .collect()
        })
        .unwrap_or_default();

    let author = if !actors.is_empty() {
        actors[0].clone()
    } else {
        target.pointer("/author/name").and_then(|n| n.as_str()).unwrap_or("知乎用户").to_string()
    };

    let actors_joined = if !actors.is_empty() {
        actors.join("、")
    } else {
        author.clone()
    };

    let author_face = moment
        .pointer("/actors/0/avatar_url")
        .and_then(|u| u.as_str())
        .or_else(|| target.pointer("/author/avatar_url").and_then(|u| u.as_str()))
        .unwrap_or("")
        .to_string();

    let extracted = extract_content(target, &moment_type);
    if extracted.link.is_empty() || extracted.link.contains("zhihu.com/zhihu_") {
        return None;
    }

    // RSSHub algorithm: action_text_tpl template interpolation
    let action_str = if let Some(tpl) = moment.get("action_text_tpl").and_then(|t| t.as_str()) {
        tpl.replace("{}", &actors_joined)
    } else if let Some(act) = moment.get("action_text").and_then(|a| a.as_str()) {
        act.to_string()
    } else {
        String::new()
    };

    let target_title = if !extracted.title.is_empty() {
        extracted.title.clone()
    } else {
        target.pointer("/question/title").and_then(|t| t.as_str()).unwrap_or("").to_string()
    };

    let title = if !action_str.is_empty() {
        if !target_title.is_empty() {
            format!("{}: {}", action_str, target_title)
        } else {
            action_str
        }
    } else if !target_title.is_empty() {
        format!("{}: {}", author, target_title)
    } else {
        format!("{} 的知乎动态", author)
    };

    let id = format!("zhihu_{}", target_id.trim_matches('"'));
    let created_time = target.get("created_time").and_then(|t| t.as_i64()).unwrap_or(0);
    let updated_time = target.get("updated_time").and_then(|t| t.as_i64()).unwrap_or(0);
    let pub_time = (if created_time > 0 { created_time } else { updated_time }) * 1000;

    let stats = DynamicStats {
        like: target.get("voteup_count").and_then(|c| c.as_u64()).unwrap_or(0),
        comment: target.get("comment_count").and_then(|c| c.as_u64()).unwrap_or(0),
        view: 0,
        forward: 0,
        danmaku: 0,
        reshare: 0,
    };

    Some(DynamicItem {
        id,
        platform: "zhihu".to_string(),
        item_type: moment_type,
        author,
        author_face,
        author_mid: None,
        author_url: None,
        title,
        raw_title: extracted.title,
        content: extracted.content,
        link: extracted.link,
        images: extracted.images,
        video_cover: extracted.video_cover,
        video_duration: String::new(),
        video_bvid: String::new(),
        emojis: std::collections::HashMap::new(),
        orig_dynamic: None,
        publish_time: pub_time,
        stats,
    })
}

struct ZhihuExtracted {
    title: String,
    content: String,
    link: String,
    images: Vec<String>,
    video_cover: String,
}

fn get_best_content(target: &Value) -> String {
    // 1. content_html
    if let Some(ch) = target.get("content_html").and_then(|c| c.as_str()) {
        if !ch.trim().is_empty() {
            return process_zhihu_content(ch);
        }
    }
    // 2. content as string
    if let Some(c) = target.get("content").and_then(|c| c.as_str()) {
        if !c.trim().is_empty() {
            return process_zhihu_content(c);
        }
    }
    // 3. content as array of blocks (for pins and new editor)
    if let Some(arr) = target.get("content").and_then(|c| c.as_array()) {
        let pin_html = build_pin_html(Some(&Value::Array(arr.clone())), "");
        if !pin_html.trim().is_empty() {
            return pin_html;
        }
    }
    // 4. detail (for question)
    if let Some(d) = target.get("detail").and_then(|c| c.as_str()) {
        if !d.trim().is_empty() {
            return process_zhihu_content(d);
        }
    }
    // 5. excerpt
    if let Some(ex) = target.get("excerpt").and_then(|c| c.as_str()) {
        if !ex.trim().is_empty() {
            return process_zhihu_content(ex);
        }
    }
    String::new()
}

fn extract_content(target: &Value, moment_type: &str) -> ZhihuExtracted {
    let mut title = String::new();
    let content;
    let mut link = String::new();
    let mut images = Vec::new();
    let mut video_cover = String::new();

    let target_id = target.get("id").map(|i| i.to_string().trim_matches('"').to_string()).unwrap_or_default();

    match moment_type {
        "answer" => {
            if let Some(q) = target.get("question") {
                title = q.get("title").and_then(|t| t.as_str()).unwrap_or("").to_string();
                let q_id = q.get("id").map(|i| i.to_string().trim_matches('"').to_string()).unwrap_or_default();
                link = format!("https://www.zhihu.com/question/{}/answer/{}", q_id, target_id);
            }
            content = get_best_content(target);
        }
        "article" => {
            title = target.get("title").and_then(|t| t.as_str()).unwrap_or("").to_string();
            content = get_best_content(target);
            link = format!("https://zhuanlan.zhihu.com/p/{}", target_id);
        }
        "pin" => {
            title = target.get("excerpt_title").and_then(|t| t.as_str()).unwrap_or("").to_string();
            content = build_pin_html(target.get("content"), &title);
            link = format!("https://www.zhihu.com/pin/{}", target_id);
        }
        "question" => {
            title = target.get("title").and_then(|t| t.as_str()).unwrap_or("").to_string();
            content = get_best_content(target);
            link = format!("https://www.zhihu.com/question/{}", target_id);
        }
        "zvideo" => {
            title = target.get("title").and_then(|t| t.as_str()).unwrap_or("视频").to_string();
            content = target.get("description").or_else(|| target.get("excerpt")).and_then(|c| c.as_str()).unwrap_or("").to_string();
            link = format!("https://www.zhihu.com/zvideo/{}", target_id);
            if let Some(c) = target.pointer("/video/thumbnail").or_else(|| target.get("thumbnail")).and_then(|t| t.as_str()) {
                video_cover = c.to_string();
            }
        }
        "collection" => {
            title = target.get("title").and_then(|t| t.as_str()).unwrap_or("收藏夹").to_string();
            content = target.get("description").and_then(|d| d.as_str()).unwrap_or("").to_string();
            link = format!("https://www.zhihu.com/collection/{}", target_id);
        }
        "column" => {
            title = target.get("title").and_then(|t| t.as_str()).unwrap_or("专栏").to_string();
            let intro = target.get("intro").and_then(|i| i.as_str()).unwrap_or("");
            let img = target.get("image_url").and_then(|u| u.as_str()).unwrap_or("");
            content = format!("<p>{}</p><p><img src=\"{}\" /></p>", html_escape(intro), img);
            link = format!("https://zhuanlan.zhihu.com/{}", target_id);
        }
        "roundtable" => {
            title = target.get("name").and_then(|t| t.as_str()).unwrap_or("圆桌").to_string();
            content = target.get("description").and_then(|d| d.as_str()).unwrap_or("").to_string();
            link = format!("https://www.zhihu.com/roundtable/{}", target_id);
        }
        _ => {
            title = target.get("title").and_then(|t| t.as_str()).unwrap_or("").to_string();
            content = get_best_content(target);
            if let Some(u) = target.get("url").and_then(|u| u.as_str()) {
                link = u.to_string();
            }
        }
    }

    // Extract real image URLs into images list
    let re_img = Regex::new(r#"<img\b[^>]*?\bsrc="([^"]+)""#).unwrap();
    for cap in re_img.captures_iter(&content) {
        let u = cap[1].to_string();
        if !u.starts_with("data:") && !images.contains(&u) {
            images.push(u);
        }
    }

    ZhihuExtracted {
        title,
        content,
        link,
        images,
        video_cover,
    }
}

pub fn process_zhihu_content(content: &str) -> String {
    if content.is_empty() {
        return String::new();
    }

    // 1. Remove noscript tags
    let re_noscript = Regex::new(r"(?is)<noscript>.*?</noscript>").unwrap();
    let mut html = re_noscript.replace_all(content, "").to_string();

    // 2. Remove MCN card links
    let re_mcn = Regex::new(r#"(?is)<a\b[^>]*data-draft-type="mcn-link-card"[^>]*>.*?</a>"#).unwrap();
    html = re_mcn.replace_all(&html, "").to_string();

    // 3. Resolve redirect links: link.zhihu.com/?target=... -> decoded target
    let re_link = Regex::new(r#"href="https?://link\.zhihu\.com/\?target=([^"&]+)[^"]*""#).unwrap();
    html = re_link.replace_all(&html, |caps: &regex::Captures| {
        let raw_target = &caps[1];
        let decoded = urlencoding::decode(raw_target).unwrap_or(std::borrow::Cow::Borrowed(raw_target));
        format!(r#"href="{}""#, decoded)
    }).to_string();

    // 4. RSSHub Critical Lazy Image Fix:
    // Replace SVG placeholder src with data-actualsrc or data-original
    let re_actual = Regex::new(r#"(?is)<img\b([^>]*?)\bdata-actualsrc="([^"]+)"([^>]*?)>"#).unwrap();
    html = re_actual.replace_all(&html, |caps: &regex::Captures| {
        let before = &caps[1];
        let actual = &caps[2];
        let after = &caps[3];
        let re_src = Regex::new(r#"\bsrc="[^"]*""#).unwrap();
        let cleaned_before = re_src.replace_all(before, "");
        let cleaned_after = re_src.replace_all(after, "");
        format!(r#"<img{} src="{}"{}>"#, cleaned_before, actual, cleaned_after)
    }).to_string();

    let re_orig = Regex::new(r#"(?is)<img\b([^>]*?)\bdata-original="([^"]+)"([^>]*?)>"#).unwrap();
    html = re_orig.replace_all(&html, |caps: &regex::Captures| {
        let before = &caps[1];
        let orig = &caps[2];
        let after = &caps[3];
        let re_src = Regex::new(r#"\bsrc="[^"]*""#).unwrap();
        let cleaned_before = re_src.replace_all(before, "");
        let cleaned_after = re_src.replace_all(after, "");
        format!(r#"<img{} src="{}"{}>"#, cleaned_before, orig, cleaned_after)
    }).to_string();

    // 5. Upgrade image resolutions: _b.(jpg|png) -> _1440w.$1
    let re_img_res = Regex::new(r"_(?:b|r)\.(jpg|png|gif|webp)").unwrap();
    html = re_img_res.replace_all(&html, "_1440w.$1").to_string();

    html
}

pub fn build_pin_html(content_val: Option<&Value>, excerpt_title: &str) -> String {
    let mut parts = Vec::new();
    if let Some(arr) = content_val.and_then(|c| c.as_array()) {
        for block in arr {
            let block_type = block.get("type").and_then(|t| t.as_str()).unwrap_or("");
            match block_type {
                "text" => {
                    let txt = block.get("own_text").or_else(|| block.get("content")).and_then(|t| t.as_str()).unwrap_or("");
                    if !txt.is_empty() {
                        parts.push(format!("<p>{}</p>", html_escape(txt)));
                    }
                }
                "image" => {
                    let mut img_url = block.get("url").or_else(|| block.get("original_url")).and_then(|u| u.as_str()).unwrap_or("").to_string();
                    if img_url.ends_with("/xl") {
                        img_url = format!("{}/r", &img_url[..img_url.len() - 3]);
                    }
                    if !img_url.is_empty() {
                        parts.push(format!(r#"<p><img src="{}" style="max-width:100%" referrerpolicy="no-referrer" /></p>"#, img_url));
                    }
                }
                "link" | "link_card" => {
                    if let Some(url) = block.get("url").and_then(|u| u.as_str()) {
                        let link_title = block.get("title").and_then(|t| t.as_str()).unwrap_or(url);
                        parts.push(format!(r#"<p><a href="{}" target="_blank">{}</a></p>"#, url, html_escape(link_title)));
                    }
                }
                "video" => {
                    let video_url = block.pointer("/playlist/1/url")
                        .or_else(|| block.pointer("/playlist/0/url"))
                        .and_then(|u| u.as_str());
                    if let Some(v_url) = video_url {
                        parts.push(format!(r#"<p><video controls="controls" src="{}" style="max-width:100%"></video></p>"#, v_url));
                    }
                }
                _ => {}
            }
        }
    } else if let Some(s) = content_val.and_then(|c| c.as_str()) {
        parts.push(process_zhihu_content(s));
    } else if !excerpt_title.is_empty() {
        parts.push(format!("<p>{}</p>", html_escape(excerpt_title)));
    }

    parts.join("\n")
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}
