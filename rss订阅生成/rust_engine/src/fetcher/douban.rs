use crate::config::AppConfig;
use crate::rss::proxy_image;
use crate::storage::{DataStore, DynamicItem, DynamicStats, MergeResult};
use anyhow::Result;
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, ACCEPT_LANGUAGE, COOKIE, REFERER, USER_AGENT};
use serde_json::Value;
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;
use std::time::Duration;
use tracing::{info, warn};

const M_API: &str = "https://m.douban.com/rexxar/api/v2";

/// 豆瓣 App (frodo) 接口。2026-10 起 rexxar 的 /user/{uid}/following 对所有账号返回空，
/// 关注列表只能走 frodo（需 HMAC-SHA1 签名，算法来自开源逆向实现 bestyize/DoubanAPI）
const FRODO_API: &str = "https://frodo.douban.com/api/v2";
const FRODO_APIKEY: &str = "0dad551ec0f84ed02907ff5c42e8ec70";
const FRODO_SECRET: &[u8] = b"bf7dddc7c9cfe6f7";
const FRODO_UA: &str = "api-client/1 com.douban.frodo/8.0.0(230) Android/22 product/shamu vendor/OPPO model/OPPO R11 Plus  rom/android  network/wifi  platform/mobile nd/1";

/// 每个用户每轮抓取最多补抓全文的状态数（防止请求过多触发风控）
const MAX_FULL_TEXT_PER_USER: usize = 15;

pub async fn fetch_and_store(config: &AppConfig, store: &DataStore) -> Result<MergeResult> {
    let mut cookie = config.douban.cookie.clone();
    if cookie.is_empty() || extract_uid_from_cookie(&cookie).is_none() {
        info!("[DoubanFetcher] Cookie 为空或未包含有效 UID，尝试从浏览器自动获取...");
        if let Some((new_cookie, source)) = crate::cookie::try_auto_refresh_cookie("douban") {
            info!("[DoubanFetcher] 成功从 {} 自动获取 Cookie！", source);
            cookie = new_cookie;
        } else {
            info!("[DoubanFetcher] 未配置 Cookie 且未能从浏览器自动获取，跳过");
            return Ok(MergeResult {
                total_count: store.load("douban").len(),
                new_count: 0,
            });
        }
    }

    // Extract self UID from dbcl2="uid:token"
    let self_uid = match extract_uid_from_cookie(&cookie) {
        Some(uid) => uid,
        None => {
            info!("[DoubanFetcher] 浏览器中豆瓣未登录账号（缺少 dbcl2 登录凭证），已跳过豆瓣抓取");
            return Ok(MergeResult {
                total_count: store.load("douban").len(),
                new_count: 0,
            });
        }
    };
    info!("[DoubanFetcher] 当前用户 UID: {}", self_uid);

    let ck = extract_ck_from_cookie(&cookie).unwrap_or_default();

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()?;

    let cache_file = PathBuf::from(&config.data_dir).join("douban-following.json");
    let following_uids = if !config.douban.refresh_following && cache_file.exists() {
        match fs::read_to_string(&cache_file) {
            Ok(s) => serde_json::from_str::<Vec<String>>(&s).unwrap_or_default(),
            Err(_) => Vec::new(),
        }
    } else {
        let uids = get_all_following_uids(&client, &self_uid, &ck, &cookie).await?;
        if uids.is_empty() {
            if cache_file.exists() {
                warn!("[DoubanFetcher] 接口返回关注列表为 0 人，保留旧缓存不覆盖");
                serde_json::from_str::<Vec<String>>(&fs::read_to_string(&cache_file).unwrap_or_default())
                    .unwrap_or_default()
            } else {
                warn!("[DoubanFetcher] 关注列表为 0 人（账号可能未关注任何人），仅抓取自己的广播");
                Vec::new()
            }
        } else {
            let _ = fs::write(&cache_file, serde_json::to_string(&uids).unwrap_or_default());
            info!("[DoubanFetcher] 重新拉取关注列表，共 {} 人，已缓存", uids.len());
            uids
        }
    };

    let mut all_uids = vec![self_uid];
    all_uids.extend(following_uids);

    let existing_ids: HashSet<String> = store.load("douban").into_iter().map(|i| i.id).collect();

    let mut all_items = Vec::new();

    for (i, uid) in all_uids.iter().enumerate() {
        match fetch_user_timeline(&client, uid, &cookie, &existing_ids, config.douban.max_pages.clamp(1, 10)).await {
            Ok(mut statuses) => {
                // 时间线返回的长文可能被截断，为新增状态补抓全文（参考 RSSHub）
                enrich_full_text(&client, &cookie, &existing_ids, &mut statuses).await;
                for status in &statuses {
                    if let Some(item) = normalize_status(status) {
                        if !config.douban.skip_activities.is_empty() && config.douban.skip_activities.contains(&item.item_type) {
                            continue;
                        }
                        all_items.push(item);
                    }
                }
            }
            Err(e) => {
                warn!("[DoubanFetcher] 拉取 UID {} 的广播失败: {}", uid, e);
            }
        }

        if i + 1 < all_uids.len() {
            let delay_ms = 4000 + (rand::random::<u64>() % 1000);
            tokio::time::sleep(Duration::from_millis(delay_ms)).await;
        }
    }

    if all_items.is_empty() {
        info!("[DoubanFetcher] 无新数据");
        return Ok(MergeResult {
            total_count: store.load("douban").len(),
            new_count: 0,
        });
    }

    let result = store.merge("douban", all_items.clone(), config.rss.max_items);
    info!("[DoubanFetcher] 抓取 {} 条，新增 {} 条", all_items.len(), result.new_count);
    Ok(result)
}

fn extract_uid_from_cookie(cookie: &str) -> Option<String> {
    for part in cookie.split(';') {
        let trimmed = part.trim();
        if trimmed.starts_with("dbcl2=") {
            let val = trimmed.trim_start_matches("dbcl2=").trim_matches('"');
            if let Some((uid, _)) = val.split_once(':') {
                return Some(uid.to_string());
            }
        }
    }
    None
}

fn extract_ck_from_cookie(cookie: &str) -> Option<String> {
    for part in cookie.split(';') {
        let trimmed = part.trim();
        if trimmed.starts_with("ck=") {
            return Some(trimmed.trim_start_matches("ck=").trim_matches('"').to_string());
        }
    }
    None
}

fn make_headers(cookie: &str) -> HeaderMap {
    let mut h = HeaderMap::new();
    h.insert(ACCEPT, HeaderValue::from_static("application/json"));
    h.insert(ACCEPT_LANGUAGE, HeaderValue::from_static("zh-CN,zh;q=0.9"));
    h.insert(REFERER, HeaderValue::from_static("https://m.douban.com/"));
    h.insert(
        USER_AGENT,
        HeaderValue::from_static(
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        ),
    );
    if let Ok(hv) = HeaderValue::from_str(cookie) {
        h.insert(COOKIE, hv);
    }
    h
}

/// 生成带签名的 frodo 请求 URL（HMAC-SHA1(key, "GET&<quoted_path>&<ts秒>") -> Base64）。
/// SHA-1/HMAC 为本地实现，避免为此单独引入 crate（crates.io 在部分网络下不可达）
fn frodo_signed_url(path: &str, query: &str) -> String {
    use base64::Engine;

    let ts = chrono::Utc::now().timestamp();
    let msg = format!("GET&{}&{}", urlencoding::encode(path), ts);
    let sig_bytes = hmac_sha1(FRODO_SECRET, msg.as_bytes());
    let sig = base64::engine::general_purpose::STANDARD.encode(sig_bytes);
    format!(
        "{}{}?apikey={}{}&_sig={}&_ts={}",
        FRODO_API,
        path,
        FRODO_APIKEY,
        query,
        urlencoding::encode(&sig),
        ts
    )
}

/// 纯 SHA-1 实现（FIPS 180-4）
struct Sha1 {
    state: [u32; 5],
    buffer: [u8; 64],
    buflen: usize,
    total: u64,
}

impl Sha1 {
    fn new() -> Self {
        Sha1 {
            state: [0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0],
            buffer: [0; 64],
            buflen: 0,
            total: 0,
        }
    }

    fn update(&mut self, mut data: &[u8]) {
        self.total += data.len() as u64;
        while !data.is_empty() {
            let n = (64 - self.buflen).min(data.len());
            self.buffer[self.buflen..self.buflen + n].copy_from_slice(&data[..n]);
            self.buflen += n;
            data = &data[n..];
            if self.buflen == 64 {
                let block = self.buffer;
                self.process(&block);
                self.buflen = 0;
            }
        }
    }

    fn process(&mut self, block: &[u8; 64]) {
        let mut w = [0u32; 80];
        for i in 0..16 {
            w[i] = u32::from_be_bytes([
                block[i * 4],
                block[i * 4 + 1],
                block[i * 4 + 2],
                block[i * 4 + 3],
            ]);
        }
        for i in 16..80 {
            w[i] = (w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]).rotate_left(1);
        }

        let (mut a, mut b, mut c, mut d, mut e) =
            (self.state[0], self.state[1], self.state[2], self.state[3], self.state[4]);
        for (i, &wi) in w.iter().enumerate() {
            let (f, k) = match i {
                0..=19 => ((b & c) | ((!b) & d), 0x5A827999u32),
                20..=39 => (b ^ c ^ d, 0x6ED9EBA1),
                40..=59 => ((b & c) | (b & d) | (c & d), 0x8F1BBCDC),
                _ => (b ^ c ^ d, 0xCA62C1D6),
            };
            let temp = a
                .rotate_left(5)
                .wrapping_add(f)
                .wrapping_add(e)
                .wrapping_add(k)
                .wrapping_add(wi);
            e = d;
            d = c;
            c = b.rotate_left(30);
            b = a;
            a = temp;
        }

        self.state[0] = self.state[0].wrapping_add(a);
        self.state[1] = self.state[1].wrapping_add(b);
        self.state[2] = self.state[2].wrapping_add(c);
        self.state[3] = self.state[3].wrapping_add(d);
        self.state[4] = self.state[4].wrapping_add(e);
    }

    fn finalize(mut self) -> [u8; 20] {
        let bitlen = self.total * 8;
        self.update(&[0x80]);
        while self.buflen != 56 {
            self.update(&[0]);
        }
        self.update(&bitlen.to_be_bytes());

        let mut out = [0u8; 20];
        for i in 0..5 {
            out[i * 4..i * 4 + 4].copy_from_slice(&self.state[i].to_be_bytes());
        }
        out
    }
}

/// HMAC-SHA1（RFC 2104，块长 64）
fn hmac_sha1(key: &[u8], msg: &[u8]) -> [u8; 20] {
    let mut key_block = [0u8; 64];
    if key.len() > 64 {
        let dig = {
            let mut h = Sha1::new();
            h.update(key);
            h.finalize()
        };
        key_block[..20].copy_from_slice(&dig);
    } else {
        key_block[..key.len()].copy_from_slice(key);
    }

    let mut ipad = [0x36u8; 64];
    let mut opad = [0x5cu8; 64];
    for i in 0..64 {
        ipad[i] ^= key_block[i];
        opad[i] ^= key_block[i];
    }

    let mut inner = Sha1::new();
    inner.update(&ipad);
    inner.update(msg);
    let inner_digest = inner.finalize();

    let mut outer = Sha1::new();
    outer.update(&opad);
    outer.update(&inner_digest);
    outer.finalize()
}

fn make_frodo_headers(cookie: &str) -> HeaderMap {
    let mut h = HeaderMap::new();
    h.insert(ACCEPT, HeaderValue::from_static("application/json"));
    h.insert(
        USER_AGENT,
        HeaderValue::from_static(FRODO_UA),
    );
    if let Ok(hv) = HeaderValue::from_str(cookie) {
        h.insert(COOKIE, hv);
    }
    h
}

/// 通过 frodo (豆瓣 App) 接口获取关注列表
async fn get_following_via_frodo(client: &reqwest::Client, uid: &str, cookie: &str) -> Result<Vec<String>> {
    let mut uids = Vec::new();
    let mut start = 0;

    loop {
        let path = format!("/api/v2/user/{}/following", uid);
        let query = format!("&start={}&count=50", start);
        let url = frodo_signed_url(&path, &query);

        let resp = client.get(&url).headers(make_frodo_headers(cookie)).send().await?;
        if !resp.status().is_success() {
            // 404 等视为接口不可用，交给上层回退 rexxar
            anyhow::bail!("frodo HTTP {}", resp.status());
        }
        let json: Value = resp.json().await?;

        let users = match json.get("users").and_then(|u| u.as_array()) {
            Some(arr) if !arr.is_empty() => arr,
            _ => break,
        };

        for u in users {
            if let Some(id_str) = u.get("id").and_then(|i| i.as_str()) {
                uids.push(id_str.to_string());
            }
        }

        let total = json.get("total").and_then(|t| t.as_u64()).unwrap_or(0);
        start += users.len();
        if start as u64 >= total {
            break;
        }

        tokio::time::sleep(Duration::from_millis(800)).await;
    }

    Ok(uids)
}

/// 通过旧 rexxar 接口获取关注列表（2026-10 起对所有账号返回空，仅作回退保留）
async fn get_following_via_rexxar(client: &reqwest::Client, uid: &str, ck: &str, cookie: &str) -> Result<Vec<String>> {
    let mut uids = Vec::new();
    let mut start = 0;
    let count = 50;

    loop {
        let url = format!(
            "{}/user/{}/following?start={}&count={}&for_mobile=1{}",
            M_API,
            uid,
            start,
            count,
            if !ck.is_empty() { format!("&ck={}", ck) } else { String::new() }
        );

        let resp = match client.get(&url).headers(make_headers(cookie)).send().await {
            Ok(r) => r,
            Err(_) => break,
        };

        if !resp.status().is_success() {
            break;
        }

        let json: Value = match resp.json().await {
            Ok(j) => j,
            Err(_) => break,
        };

        let users = match json.get("users").and_then(|u| u.as_array()) {
            Some(arr) if !arr.is_empty() => arr,
            _ => break,
        };

        for u in users {
            if let Some(id_str) = u.get("id").and_then(|i| i.as_str()) {
                uids.push(id_str.to_string());
            }
        }

        let total = json.get("total").and_then(|t| t.as_u64()).unwrap_or(0);
        start += users.len();
        if start as u64 >= total || users.is_empty() {
            break;
        }

        tokio::time::sleep(Duration::from_millis(800)).await;
    }

    Ok(uids)
}

/// www.douban.com 页面专用头（头不全会被反爬拦到 /misc/sorry）
fn make_www_headers(cookie: &str) -> HeaderMap {
    let mut h = HeaderMap::new();
    h.insert(ACCEPT, HeaderValue::from_static("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"));
    h.insert(ACCEPT_LANGUAGE, HeaderValue::from_static("zh-CN,zh;q=0.9"));
    h.insert(REFERER, HeaderValue::from_static("https://www.douban.com/"));
    h.insert(
        USER_AGENT,
        HeaderValue::from_static("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"),
    );
    h.insert("Sec-Fetch-Dest", HeaderValue::from_static("document"));
    h.insert("Sec-Fetch-Mode", HeaderValue::from_static("navigate"));
    h.insert("Sec-Fetch-Site", HeaderValue::from_static("same-origin"));
    if let Ok(hv) = HeaderValue::from_str(cookie) {
        h.insert(COOKIE, hv);
    }
    h
}

/// 从「我关注的人」页面 HTML 提取用户 ID 列表（域名 ID 或数字 ID 混合）
fn extract_people_ids(html: &str, self_uid: &str) -> Vec<String> {
    use std::collections::HashSet;
    let re = regex::Regex::new(r"douban\.com/people/([a-zA-Z0-9_.-]+)/").unwrap();
    let mut seen = HashSet::new();
    let mut ids = Vec::new();
    for cap in re.captures_iter(html) {
        let id = cap[1].to_string();
        // 排除自己及非用户路径残留
        if id == self_uid || id.len() > 32 {
            continue;
        }
        if seen.insert(id.clone()) {
            ids.push(id);
        }
    }
    ids
}

/// 域名 ID（如 yoichi）转数字 ID（如 4094157），时间线接口只认数字
async fn domain_id_to_numeric(client: &reqwest::Client, domain_id: &str, cookie: &str) -> Option<String> {
    let url = format!("{}/user/{}", M_API, domain_id);
    let resp = client.get(&url).headers(make_headers(cookie)).send().await.ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let json: Value = resp.json().await.ok()?;
    let id = json.get("id").and_then(|i| i.as_str())?;
    if id.chars().all(|c| c.is_ascii_digit()) {
        Some(id.to_string())
    } else {
        None
    }
}

/// 通过 www.douban.com「我关注的人」页面抓关注列表（友邻体系）。
/// 2026-10 现状：rexxar/frodo 的 /following 接口（广播关注体系）对本账号返回空，
/// 真正的关注列表只在网页版 contacts 页面可见
async fn get_following_via_www(client: &reqwest::Client, uid: &str, cookie: &str) -> Result<Vec<String>> {
    let mut raw_ids: Vec<String> = Vec::new();

    // 第一页 /people/{uid}/contacts，后续页 /contacts/list?tag=0&start=N（每页 20 人）
    for page in 0..20u32 {
        let url = if page == 0 {
            format!("https://www.douban.com/people/{}/contacts", uid)
        } else {
            format!("https://www.douban.com/contacts/list?tag=0&start={}", page * 20)
        };

        let resp = client.get(&url).headers(make_www_headers(cookie)).send().await?;
        if !resp.status().is_success() {
            anyhow::bail!("www contacts 页面 HTTP {}", resp.status());
        }
        let html = resp.text().await?;
        let page_ids = extract_people_ids(&html, uid);
        if page_ids.is_empty() {
            break;
        }
        let before = raw_ids.len();
        for id in page_ids {
            if !raw_ids.contains(&id) {
                raw_ids.push(id);
            }
        }
        if raw_ids.len() == before {
            break; // 无新用户，翻完了
        }
        tokio::time::sleep(Duration::from_millis(600)).await;
    }

    if raw_ids.is_empty() {
        anyhow::bail!("www contacts 页面未解析到任何用户");
    }

    // 域名 ID 统一转成数字 ID（时间线接口只认数字）
    let mut num_ids = Vec::new();
    for id in &raw_ids {
        if id.chars().all(|c| c.is_ascii_digit()) {
            num_ids.push(id.clone());
        } else {
            match domain_id_to_numeric(client, id, cookie).await {
                Some(n) => num_ids.push(n),
                None => warn!("[DoubanFetcher] 域名 ID {} 转换数字 ID 失败，已跳过", id),
            }
            tokio::time::sleep(Duration::from_millis(300)).await;
        }
    }

    Ok(num_ids)
}

/// 获取关注列表：www 网页（友邻体系）优先，frodo/rexxar（广播体系）兜底
async fn get_all_following_uids(client: &reqwest::Client, uid: &str, ck: &str, cookie: &str) -> Result<Vec<String>> {
    match get_following_via_www(client, uid, cookie).await {
        Ok(uids) => Ok(uids),
        Err(e) => {
            warn!("[DoubanFetcher] www 页面获取关注列表失败({}), 尝试 frodo 接口", e);
            match get_following_via_frodo(client, uid, cookie).await {
                Ok(uids) => Ok(uids),
                Err(e2) => {
                    warn!("[DoubanFetcher] frodo 也失败({}), 回退 rexxar 接口", e2);
                    get_following_via_rexxar(client, uid, ck, cookie).await
                }
            }
        }
    }
}

async fn fetch_status_detail(client: &reqwest::Client, id: &str, cookie: &str) -> Option<Value> {
    let url = format!("{}/status/{}", M_API, id);
    let resp = client.get(&url).headers(make_headers(cookie)).send().await.ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let json: Value = resp.json().await.ok()?;
    if json.get("id").is_some() {
        Some(json)
    } else {
        None
    }
}

/// 为新增（未入库）的状态补抓全文，转发的原广播同样补抓（参考 RSSHub getFullText）
async fn enrich_full_text(client: &reqwest::Client, cookie: &str, existing_ids: &HashSet<String>, statuses: &mut [Value]) {
    let mut budget = MAX_FULL_TEXT_PER_USER;

    for status in statuses.iter_mut() {
        if budget == 0 {
            break;
        }
        let Some(id) = status.get("id").and_then(json_id) else { continue };
        if existing_ids.contains(&format!("douban_{}", id)) {
            continue;
        }

        let Some(detail) = fetch_status_detail(client, &id, cookie).await else {
            continue;
        };
        budget -= 1;
        if detail.get("text").is_some() {
            *status = detail;
        }

        if budget > 0 {
            if let Some(rs_id) = status.pointer("/reshared_status/id").and_then(json_id) {
                if let Some(rs_detail) = fetch_status_detail(client, &rs_id, cookie).await {
                    budget -= 1;
                    if rs_detail.get("text").is_some() {
                        if let Some(rs) = status.get_mut("reshared_status") {
                            *rs = rs_detail;
                        }
                    }
                }
            }
        }

        tokio::time::sleep(Duration::from_millis(250)).await;
    }
}

fn json_id(v: &Value) -> Option<String> {
    match v {
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    }
}

async fn fetch_user_timeline(
    client: &reqwest::Client,
    uid: &str,
    cookie: &str,
    existing_ids: &HashSet<String>,
    max_pages: usize,
) -> Result<Vec<Value>> {
    let mut all_statuses = Vec::new();
    let mut since_id = String::new();

    for page in 0..max_pages {
        let url = if !since_id.is_empty() {
            format!("{}/status/user_timeline/{}?for_mobile=1&max_id={}", M_API, uid, since_id)
        } else {
            format!("{}/status/user_timeline/{}?for_mobile=1", M_API, uid)
        };

        let resp = match client.get(&url).headers(make_headers(cookie)).send().await {
            Ok(r) => r,
            Err(_) => break,
        };

        if !resp.status().is_success() {
            break;
        }

        let json: Value = match resp.json().await {
            Ok(j) => j,
            Err(_) => break,
        };

        let items = match json.get("items").and_then(|i| i.as_array()) {
            Some(arr) if !arr.is_empty() => arr,
            _ => break,
        };

        let mut page_statuses = Vec::new();
        for item in items {
            let status = item.get("status").unwrap_or(item);
            page_statuses.push(status.clone());
        }

        if page_statuses.is_empty() {
            break;
        }

        let has_overlap = page_statuses.iter().any(|s| {
            if let Some(id) = s.get("id") {
                existing_ids.contains(&format!("douban_{}", id.to_string().trim_matches('"')))
            } else {
                false
            }
        });

        all_statuses.extend(page_statuses.clone());

        if has_overlap {
            break;
        }

        if let Some(last) = page_statuses.last() {
            since_id = last.get("id").map(|i| i.to_string().trim_matches('"').to_string()).unwrap_or_default();
            if since_id.is_empty() {
                break;
            }
        } else {
            break;
        }

        if page + 1 < max_pages {
            tokio::time::sleep(Duration::from_millis(2000)).await;
        }
    }

    Ok(all_statuses)
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

/// 渲染广播正文：转义 + 换行转 <br> + 把话题/链接实体替换成超链接（参考 RSSHub entities 处理）
fn render_douban_text(text: &str, entities: Option<&Value>) -> String {
    if text.is_empty() {
        return String::new();
    }

    let mut s = text.to_string();
    let mut anchors: Vec<(String, String)> = Vec::new();

    if let Some(arr) = entities.and_then(|e| e.as_array()) {
        for (i, e) in arr.iter().enumerate() {
            let title = e.get("title").and_then(|t| t.as_str()).unwrap_or("");
            let uri = e.get("uri").and_then(|u| u.as_str()).unwrap_or("");
            if title.is_empty() || uri.is_empty() || !s.contains(title) {
                continue;
            }
            let placeholder = format!("\u{1}{}\u{2}", i);
            let href = format!("https://www.douban.com/doubanapp/dispatch?uri/{}", uri);
            let anchor = format!(
                r#"<a href="{}" target="_blank" rel="noopener noreferrer">{}</a>"#,
                html_escape(&href),
                html_escape(title)
            );
            s = s.replace(title, &placeholder);
            anchors.push((placeholder, anchor));
        }
    }

    let mut html = html_escape(&s).replace('\n', "<br>");
    for (placeholder, anchor) in anchors {
        html = html.replace(&placeholder, &anchor);
    }
    format!("<p>{}</p>", html)
}

fn image_url_from(img: &Value) -> Option<String> {
    let url = img
        .pointer("/large/url")
        .or_else(|| img.pointer("/normal/url"))
        .or_else(|| img.get("url"))
        .and_then(|u| u.as_str())
        .filter(|u| !u.is_empty())?;
    Some(if url.starts_with("//") { format!("https:{}", url) } else { url.to_string() })
}

fn images_from_status(status: &Value) -> Vec<String> {
    let mut images = Vec::new();
    if let Some(imgs) = status.get("images").and_then(|i| i.as_array()) {
        for img in imgs {
            if let Some(src) = image_url_from(img) {
                images.push(src);
            }
        }
    }
    images
}

fn img_tag(src: &str) -> String {
    format!(
        r#"<p><img src="{}" style="max-width:100%;border-radius:4px" referrerpolicy="no-referrer" /></p>"#,
        proxy_image(src)
    )
}

/// 附加的书影音/小组卡片（参考 RSSHub card 渲染）
fn render_card(card: &Value) -> Option<String> {
    let title = card.get("title").and_then(|t| t.as_str()).filter(|t| !t.is_empty())?;

    let mut parts = Vec::new();

    let cover = card
        .get("image")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| if s.starts_with("//") { format!("https:{}", s) } else { s.to_string() })
        .or_else(|| card.get("image_url").and_then(|v| v.as_str()).filter(|s| !s.is_empty()).map(|s| s.to_string()));
    if let Some(cover) = cover {
        parts.push(format!(
            r#"<p><img src="{}" style="max-width:100%;border-radius:4px" referrerpolicy="no-referrer" /></p>"#,
            proxy_image(&cover)
        ));
    }

    let url = card.get("url").and_then(|u| u.as_str()).filter(|u| !u.is_empty());
    let title_html = match url {
        Some(u) => format!(
            r#"<a href="{}" target="_blank" rel="noopener noreferrer" style="font-weight:bold">{}</a>"#,
            html_escape(u),
            html_escape(title)
        ),
        None => format!("<strong>{}</strong>", html_escape(title)),
    };
    parts.push(format!("<div>{}</div>", title_html));

    if let Some(subtitle) = card.get("subtitle").and_then(|s| s.as_str()).filter(|s| !s.is_empty()) {
        parts.push(format!(
            r#"<div style="font-size:12px;color:#9a9a9a">{}</div>"#,
            html_escape(subtitle)
        ));
    }

    if let Some(rating) = card.pointer("/rating/value").and_then(|r| r.as_f64()) {
        parts.push(format!(
            r#"<div style="font-size:12px;color:#f5a623">评分：{}</div>"#,
            rating
        ));
    }

    // 卡片附加的图片列表（如相册卡片）
    if let Some(imgs) = card.pointer("/images_block/images").and_then(|v| v.as_array()) {
        for entry in imgs {
            if let Some(src) = entry
                .pointer("/image/large/url")
                .or_else(|| entry.pointer("/image/url"))
                .and_then(|u| u.as_str())
                .filter(|u| !u.is_empty())
            {
                let full = if src.starts_with("//") { format!("https:{}", src) } else { src.to_string() };
                parts.push(img_tag(&full));
            }
        }
    }

    Some(format!(
        r#"<blockquote style="margin:8px 0 0;padding:8px 12px;background:#80808010;border-top:1px solid #80808030;border-left:4px solid #80808030;border-radius:4px">{}</blockquote>"#,
        parts.join("")
    ))
}

fn render_video(video_info: &Value) -> Option<String> {
    let src = video_info.get("video_url").and_then(|v| v.as_str()).filter(|s| !s.is_empty())?;
    let poster = video_info
        .get("cover_url")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| proxy_image(s))
        .unwrap_or_default();
    Some(format!(
        r#"<p><video src="{}" poster="{}" controls="controls" style="max-width:100%" referrerpolicy="no-referrer"></video></p>"#,
        html_escape(src),
        poster
    ))
}

fn status_link(status: &Value, fallback_id: &str) -> String {
    if let Some(u) = status
        .get("sharing_url")
        .or_else(|| status.get("url"))
        .and_then(|u| u.as_str())
        .filter(|u| !u.is_empty())
    {
        return u.split('?').next().unwrap_or("").to_string();
    }
    let author_id = status.pointer("/author/id").and_then(|i| i.as_str()).unwrap_or("");
    format!("https://www.douban.com/people/{}/status/{}/", author_id, fallback_id)
}

/// 转发的原广播块（参考 RSSHub reshared_status 渲染）
fn render_reshared_blockquote(rs: &Value) -> String {
    let author = rs.pointer("/author/name").and_then(|n| n.as_str()).unwrap_or("未知作者");
    let mut inner = Vec::new();

    inner.push(format!(
        "<div><strong>@{}</strong>&ensp;{}:</div>",
        html_escape(author),
        rs.get("activity").and_then(|a| a.as_str()).unwrap_or("说")
    ));

    let text_html = render_douban_text(
        rs.get("text").and_then(|t| t.as_str()).unwrap_or(""),
        rs.get("entities"),
    );
    if !text_html.is_empty() {
        inner.push(text_html);
    }

    for src in images_from_status(rs) {
        inner.push(img_tag(&src));
    }

    if let Some(video) = rs.get("video_info").filter(|v| !v.is_null()).and_then(render_video) {
        inner.push(video);
    }

    if let Some(card_html) = rs.get("card").filter(|c| !c.is_null()).and_then(render_card) {
        inner.push(card_html);
    }

    let rs_id = rs.get("id").and_then(json_id).unwrap_or_default();
    let link = status_link(rs, &rs_id);
    inner.push(format!(
        r#"<div style="font-size:12px;margin-top:6px"><a href="{}" target="_blank" rel="noopener noreferrer">原动态 ↗</a></div>"#,
        html_escape(&link)
    ));

    format!(
        r#"<blockquote style="margin:8px 0 0;padding:8px 12px;background:#80808010;border-left:4px solid #80808030;border-radius:4px">{}</blockquote>"#,
        inner.join("")
    )
}

/// 参考 RSSHub tryFixStatus：处理已删除/不可见的状态
fn normalize_status(status: &Value) -> Option<DynamicItem> {
    let id_val = status.get("id")?;
    let status_id = id_val.to_string().trim_matches('"').to_string();

    // 已删除的直接跳过（RSSHub 在列表层过滤 deleted 项）
    if status.get("deleted").and_then(|d| d.as_bool()).unwrap_or(false) {
        return None;
    }

    let author = status.pointer("/author/name").and_then(|n| n.as_str()).unwrap_or("未知作者").to_string();
    let author_face = status.pointer("/author/avatar").and_then(|a| a.as_str()).unwrap_or("").to_string();
    let author_url = status.pointer("/author/url").and_then(|u| u.as_str()).map(|s| s.to_string());
    let activity = status.get("activity").and_then(|a| a.as_str()).unwrap_or("说").to_string();
    let raw_text = status.get("text").and_then(|t| t.as_str()).unwrap_or("").to_string();
    let reshared = status.get("reshared_status").filter(|r| !r.is_null());

    // 不可见 / 不可访问的状态占位
    let unavailable_reason = if status.get("hidden").and_then(|h| h.as_bool()).unwrap_or(false) {
        Some(
            status
                .get("msg")
                .and_then(|m| m.as_str())
                .unwrap_or("[ 内容已被设为不可见 ]")
                .to_string(),
        )
    } else if status.get("text").map(|t| t.is_null()).unwrap_or(false) {
        Some("[ 内容已不可访问 ]".to_string())
    } else {
        None
    };

    let create_time = status.get("create_time").and_then(|c| c.as_str()).unwrap_or("");
    let pub_time = if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(create_time, "%Y-%m-%d %H:%M:%S") {
        dt.and_utc().timestamp_millis() - (8 * 3600 * 1000)
    } else {
        chrono::Utc::now().timestamp_millis()
    };

    if let Some(reason) = unavailable_reason {
        return Some(DynamicItem {
            id: format!("douban_{}", status_id),
            platform: "douban".to_string(),
            item_type: activity,
            author,
            author_face,
            author_mid: None,
            author_url,
            title: reason.clone(),
            raw_title: reason.clone(),
            content: format!("<p>{}</p>", html_escape(&reason)),
            link: status_link(status, &status_id),
            images: Vec::new(),
            video_cover: String::new(),
            video_duration: String::new(),
            video_bvid: String::new(),
            emojis: std::collections::HashMap::new(),
            orig_dynamic: None,
            publish_time: pub_time,
            stats: DynamicStats::default(),
        });
    }

    // ---- 标题：作者 + 动作 + (《卡片标题》) + 正文（参考 RSSHub 标题格式）----
    let mut title = format!("{} ", author);
    if let Some(rs) = reshared {
        let rs_author = rs.pointer("/author/name").and_then(|n| n.as_str()).unwrap_or("未知作者");
        title.push_str(&format!("转发 {} 的广播", rs_author));
    } else {
        title.push_str(&activity);
    }

    if let Some(card) = status.get("card").filter(|c| !c.is_null()) {
        if let Some(card_title) = card.get("title").and_then(|t| t.as_str()).filter(|t| !t.is_empty()) {
            let has_rating = card.pointer("/rating/value").map(|r| !r.is_null()).unwrap_or(false);
            if has_rating {
                title.push_str(&format!("《{}》", card_title));
            } else {
                title.push_str(&format!("「{}」", card_title));
            }
        }
    }

    // 转发且无自己的评论时，标题带上原广播内容
    let display_text = if !raw_text.is_empty() {
        raw_text.clone()
    } else {
        reshared
            .and_then(|rs| rs.get("text"))
            .and_then(|t| t.as_str())
            .unwrap_or("")
            .to_string()
    };
    if !display_text.is_empty() {
        title.push_str(&format!(": {}", display_text.replace('\n', " ")));
    }

    // ---- 正文 HTML：文字 + 视频 + 引用 + 卡片 + 转发块 ----
    // 注意：图片不再内联进 content（由 RSS 渲染层统一追加，避免重复）
    let mut content_parts = Vec::new();

    let text_html = render_douban_text(&raw_text, status.get("entities"));
    if !text_html.is_empty() {
        content_parts.push(text_html);
    }

    let mut video_cover = String::new();
    if let Some(vi) = status.get("video_info").filter(|v| !v.is_null()) {
        if let Some(video_html) = render_video(vi) {
            content_parts.push(video_html);
            video_cover = vi.get("cover_url").and_then(|c| c.as_str()).unwrap_or("").to_string();
        }
    }

    // 引用的广播（Fw / 🔁）
    if let Some(parent) = status.get("parent_status").filter(|p| !p.is_null()) {
        let p_author = parent.pointer("/author/name").and_then(|n| n.as_str()).unwrap_or("");
        let p_text = render_douban_text(
            parent.get("text").and_then(|t| t.as_str()).unwrap_or(""),
            parent.get("entities"),
        );
        let p_body = if p_text.is_empty() {
            String::new()
        } else {
            format!("&ensp;{}", p_text)
        };
        content_parts.push(format!(
            r#"<blockquote style="margin:6px 0 0;padding:6px 10px;background:#80808010;border-left:3px solid #80808030;border-radius:4px">🔁 <strong>{}</strong>{}</blockquote>"#,
            html_escape(p_author),
            p_body
        ));
    }

    if let Some(card_html) = status.get("card").filter(|c| !c.is_null()).and_then(render_card) {
        content_parts.push(card_html);
    }

    if let Some(rs) = reshared {
        content_parts.push(render_reshared_blockquote(rs));
    }

    let stats = DynamicStats {
        like: status.get("like_count").and_then(|c| c.as_u64()).unwrap_or(0),
        comment: status.get("comments_count").and_then(|c| c.as_u64()).unwrap_or(0),
        reshare: status.get("reshares_count").and_then(|c| c.as_u64()).unwrap_or(0),
        view: 0,
        forward: 0,
        danmaku: 0,
    };

    Some(DynamicItem {
        id: format!("douban_{}", status_id),
        platform: "douban".to_string(),
        item_type: activity,
        author,
        author_face,
        author_mid: None,
        author_url,
        title,
        raw_title: raw_text,
        content: content_parts.join("\n"),
        link: status_link(status, &status_id),
        images: images_from_status(status),
        video_cover,
        video_duration: String::new(),
        video_bvid: String::new(),
        emojis: std::collections::HashMap::new(),
        orig_dynamic: None,
        publish_time: pub_time,
        stats,
    })
}

/// 手动刷新豆瓣关注列表缓存（供 API 调用），返回关注人数
pub async fn refresh_following_cache(config: &AppConfig) -> Result<usize, String> {
    let mut cookie = config.douban.cookie.clone();
    if cookie.is_empty() || extract_uid_from_cookie(&cookie).is_none() {
        match crate::cookie::try_auto_refresh_cookie("douban") {
            Some((new_cookie, _)) => cookie = new_cookie,
            None => return Err("未配置豆瓣 Cookie 且未能从浏览器自动获取".to_string()),
        }
    }

    let uid = extract_uid_from_cookie(&cookie).ok_or("Cookie 中缺少 dbcl2 登录凭证（可能未登录）")?;
    let ck = extract_ck_from_cookie(&cookie).unwrap_or_default();

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;

    let uids = get_all_following_uids(&client, &uid, &ck, &cookie)
        .await
        .map_err(|e| e.to_string())?;

    if uids.is_empty() {
        // 不用空列表覆盖旧缓存，避免一次接口异常毁掉整个关注列表
        return Err(
            "接口返回关注列表为 0 人（该账号当前未关注任何人，或豆瓣接口异常）。已保留原有缓存，未做修改".to_string(),
        );
    }

    let cache_file = PathBuf::from(&config.data_dir).join("douban-following.json");
    fs::write(&cache_file, serde_json::to_string(&uids).unwrap_or_default())
        .map_err(|e| format!("写入缓存失败: {}", e))?;

    Ok(uids.len())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_sha1_vectors() {
        // FIPS 180-4 标准向量
        let hex = |b: &[u8]| b.iter().map(|x| format!("{:02x}", x)).collect::<String>();
        let h = |s: &str| {
            let mut sh = Sha1::new();
            sh.update(s.as_bytes());
            sh.finalize()
        };
        assert_eq!(hex(&h("abc")), "a9993e364706816aba3e25717850c26c9cd0d89d");
        assert_eq!(hex(&h("")), "da39a3ee5e6b4b0d3255bfef95601890afd80709");
        // RFC 2202 HMAC-SHA1 向量
        assert_eq!(
            hex(&hmac_sha1(b"key", b"The quick brown fox jumps over the lazy dog")),
            "de7c9b85b8b78aa6bc8a7a36f70a90701c9db4d9"
        );
    }

    #[test]
    fn test_frodo_signature_vector() {
        use base64::Engine;
        let msg = "GET&%2Fapi%2Fv2%2Fuser%2F123456%2Ffollowing&1700000000";
        let sig = base64::engine::general_purpose::STANDARD.encode(hmac_sha1(FRODO_SECRET, msg.as_bytes()));
        assert_eq!(sig, "roOhxGZNCBVeekBlFd3OcivUboc=");
    }

    #[test]
    fn test_normalize_text_status() {
        let status = json!({
            "id": "123456",
            "activity": "说",
            "text": "今天看了部电影\n还不错 #周末#",
            "create_time": "2026-10-25 10:00:00",
            "sharing_url": "https://www.douban.com/people/abc/status/123456/?_i=xxx",
            "author": {"name": "张三", "avatar": "//img.doubanio.com/icon/u1.jpg", "url": "https://www.douban.com/people/abc/", "id": "abc"},
            "entities": [{"title": "#周末#", "uri": "/topic/weekend/"}],
            "images": [{"large": {"url": "//img.doubanio.com/large.jpg"}}],
            "like_count": 3, "comments_count": 1, "reshares_count": 0
        });
        let item = normalize_status(&status).unwrap();
        assert_eq!(item.id, "douban_123456");
        assert!(item.title.starts_with("张三 说: "), "title = {}", item.title);
        assert_eq!(item.link, "https://www.douban.com/people/abc/status/123456/");
        assert_eq!(item.images.len(), 1);
        assert!(item.content.contains("<a href=\"https://www.douban.com/doubanapp/dispatch?uri/"), "content = {}", item.content);
        assert!(!item.content.contains("<img"), "图片不应内联进 content: {}", item.content);
    }

    #[test]
    fn test_normalize_reshare_with_card() {
        let status = json!({
            "id": "222",
            "activity": "转发",
            "text": "",
            "create_time": "2026-10-25 10:00:00",
            "author": {"name": "李四", "avatar": "", "id": "l4"},
            "reshared_status": {
                "id": "111",
                "activity": "说",
                "text": "原广播内容",
                "create_time": "2026-10-24 10:00:00",
                "author": {"name": "王五", "id": "w5"},
                "images": [{"large": {"url": "//img.doubanio.com/orig.jpg"}}],
                "card": {"title": "流浪地球", "subtitle": "电影 / 科幻", "rating": {"value": 8.0}, "url": "https://movie.douban.com/subject/1/"}
            }
        });
        let item = normalize_status(&status).unwrap();
        assert!(item.title.contains("李四 转发 王五 的广播"), "title = {}", item.title);
        assert!(item.title.contains("原广播内容"));
        assert!(item.content.contains("<blockquote"), "content = {}", item.content);
        assert!(item.content.contains("评分：8"), "content = {}", item.content);
        assert!(item.content.contains("流浪地球"));
        assert!(item.content.contains("原动态 ↗"));
    }

    #[test]
    fn test_deleted_and_hidden() {
        let deleted = json!({"id": "1", "deleted": true});
        assert!(normalize_status(&deleted).is_none());

        let hidden = json!({
            "id": "2", "hidden": true, "activity": "说",
            "author": {"name": "a", "id": "a1"}, "create_time": "2026-10-25 10:00:00"
        });
        let item = normalize_status(&hidden).unwrap();
        assert_eq!(item.title, "[ 内容已被设为不可见 ]");
        assert!(item.link.contains("/people/a1/status/2/"));
    }
}
