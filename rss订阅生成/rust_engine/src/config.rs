use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub port: u16,
    pub r2: R2Config,
    pub bilibili: BilibiliConfig,
    pub bilibili_alt: BilibiliAltConfig,
    pub zhihu: ZhihuConfig,
    pub douban: DoubanConfig,
    pub fetch: FetchConfig,
    pub render: RenderConfig,
    pub rss: RssConfig,
    pub data_dir: String,
    pub auto_sync: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct R2Config {
    pub account_id: String,
    pub bucket_name: String,
    pub access_key_id: String,
    pub secret_access_key: String,
    pub public_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BilibiliConfig {
    pub cookie: String,
    pub sessdata: String,
    pub max_pages: usize,
    pub skip_types: Vec<String>,
    pub block_keywords: Vec<String>,
    pub extra_pages: usize,
    pub video_only: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BilibiliAltConfig {
    pub cookie: String,
    pub sessdata: String,
    pub max_pages: usize,
    pub max_items: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ZhihuConfig {
    pub cookie: String,
    pub max_pages: usize,
    pub skip_verbs: Vec<String>,
    pub extra_pages: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DoubanConfig {
    pub cookie: String,
    pub max_pages: usize,
    pub skip_activities: Vec<String>,
    pub extra_pages: usize,
    pub refresh_following: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FetchConfig {
    pub interval_minutes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenderConfig {
    pub bilibili_embed_player: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RssConfig {
    pub bilibili_key: String,
    pub zhihu_key: String,
    pub bilibili_alt_key: String,
    pub douban_key: String,
    pub bilibili_title: String,
    pub zhihu_title: String,
    pub bilibili_alt_title: String,
    pub douban_title: String,
    pub bilibili_desc: String,
    pub zhihu_desc: String,
    pub bilibili_alt_desc: String,
    pub douban_desc: String,
    pub max_items: usize,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            port: 3457,
            r2: R2Config::default(),
            bilibili: BilibiliConfig {
                cookie: String::new(),
                sessdata: String::new(),
                max_pages: 5,
                skip_types: Vec::new(),
                block_keywords: Vec::new(),
                extra_pages: 0,
                video_only: false,
            },
            bilibili_alt: BilibiliAltConfig {
                cookie: String::new(),
                sessdata: String::new(),
                max_pages: 5,
                max_items: 100,
            },
            zhihu: ZhihuConfig {
                cookie: String::new(),
                max_pages: 5,
                skip_verbs: Vec::new(),
                extra_pages: 0,
            },
            douban: DoubanConfig {
                cookie: String::new(),
                max_pages: 5,
                skip_activities: Vec::new(),
                extra_pages: 0,
                refresh_following: false,
            },
            fetch: FetchConfig {
                interval_minutes: 30,
            },
            render: RenderConfig {
                bilibili_embed_player: false,
            },
            rss: RssConfig {
                bilibili_key: "bilibili.xml".to_string(),
                zhihu_key: "zhihu.xml".to_string(),
                bilibili_alt_key: "bilibili-alt.xml".to_string(),
                douban_key: "douban.xml".to_string(),
                bilibili_title: "B站关注动态".to_string(),
                zhihu_title: "知乎关注动态".to_string(),
                bilibili_alt_title: "B站小号关注动态".to_string(),
                douban_title: "豆瓣关注动态".to_string(),
                bilibili_desc: "我的B站关注列表的最新动态".to_string(),
                zhihu_desc: "我的知乎关注列表的最新动态".to_string(),
                bilibili_alt_desc: "我的B站小号关注列表的最新动态".to_string(),
                douban_desc: "我的豆瓣关注列表的最新动态".to_string(),
                max_items: 200,
            },
            data_dir: "./data".to_string(),
            auto_sync: true,
        }
    }
}

impl AppConfig {
    pub fn load_from_env_file<P: AsRef<Path>>(path: P) -> Self {
        let mut map = HashMap::new();
        if let Ok(content) = fs::read_to_string(&path) {
            for line in content.lines() {
                let trimmed = line.trim();
                if trimmed.is_empty() || trimmed.starts_with('#') {
                    continue;
                }
                if let Some((k, v)) = trimmed.split_once('=') {
                    map.insert(k.trim().to_string(), v.trim().to_string());
                }
            }
        }

        let mut cfg = AppConfig::default();

        let get_str = |key: &str| map.get(key).cloned().unwrap_or_default();
        let get_u16 = |key: &str, def: u16| map.get(key).and_then(|v| v.parse().ok()).unwrap_or(def);
        let get_usize = |key: &str, def: usize| map.get(key).and_then(|v| v.parse().ok()).unwrap_or(def);
        let get_u64 = |key: &str, def: u64| map.get(key).and_then(|v| v.parse().ok()).unwrap_or(def);
        let get_bool = |key: &str, def: bool| map.get(key).map(|v| v == "true").unwrap_or(def);
        let parse_list = |key: &str| -> Vec<String> {
            map.get(key)
                .map(|v| v.split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect())
                .unwrap_or_default()
        };

        cfg.port = get_u16("PORT", 3457);
        cfg.data_dir = {
            let d = get_str("DATA_DIR");
            if d.is_empty() { "./data".to_string() } else { d }
        };
        cfg.auto_sync = map.get("AUTO_SYNC").map(|v| v != "false").unwrap_or(true);

        cfg.r2.account_id = get_str("CF_ACCOUNT_ID");
        cfg.r2.bucket_name = get_str("R2_BUCKET_NAME");
        cfg.r2.access_key_id = get_str("R2_ACCESS_KEY_ID");
        cfg.r2.secret_access_key = get_str("R2_SECRET_ACCESS_KEY");
        cfg.r2.public_url = get_str("R2_PUBLIC_URL");

        cfg.bilibili.cookie = get_str("BILIBILI_COOKIE");
        cfg.bilibili.sessdata = get_str("BILIBILI_SESSDATA");
        cfg.bilibili.max_pages = get_usize("BILIBILI_MAX_PAGES", 5);
        cfg.bilibili.skip_types = parse_list("BILIBILI_SKIP_TYPES");
        cfg.bilibili.block_keywords = parse_list("BILIBILI_BLOCK_KEYWORDS");
        cfg.bilibili.extra_pages = get_usize("BILIBILI_EXTRA_PAGES", 0);
        cfg.bilibili.video_only = get_bool("BILIBILI_VIDEO_ONLY", false);

        cfg.bilibili_alt.cookie = get_str("BILIBILI_ALT_COOKIE");
        cfg.bilibili_alt.sessdata = get_str("BILIBILI_ALT_SESSDATA");
        cfg.bilibili_alt.max_pages = get_usize("BILIBILI_ALT_MAX_PAGES", 5);
        cfg.bilibili_alt.max_items = get_usize("BILIBILI_ALT_MAX_ITEMS", 100);

        cfg.zhihu.cookie = get_str("ZHIHU_COOKIE");
        cfg.zhihu.max_pages = get_usize("ZHIHU_MAX_PAGES", 5);
        cfg.zhihu.skip_verbs = parse_list("ZHIHU_SKIP_VERBS");
        cfg.zhihu.extra_pages = get_usize("ZHIHU_EXTRA_PAGES", 0);

        cfg.douban.cookie = get_str("DOUBAN_COOKIE");
        cfg.douban.max_pages = get_usize("DOUBAN_MAX_PAGES", 5);
        cfg.douban.skip_activities = parse_list("DOUBAN_SKIP_ACTIVITIES");
        cfg.douban.extra_pages = get_usize("DOUBAN_EXTRA_PAGES", 0);
        cfg.douban.refresh_following = get_bool("DOUBAN_REFRESH_FOLLOWING", false);

        cfg.fetch.interval_minutes = get_u64("FETCH_INTERVAL", 30);
        cfg.render.bilibili_embed_player = get_bool("BILIBILI_EMBED_PLAYER", false);

        let get_rss_str = |key: &str, def: &str| {
            let v = get_str(key);
            if v.is_empty() { def.to_string() } else { v }
        };

        cfg.rss.bilibili_key = get_rss_str("RSS_BILIBILI_KEY", "bilibili.xml");
        cfg.rss.zhihu_key = get_rss_str("RSS_ZHIHU_KEY", "zhihu.xml");
        cfg.rss.bilibili_alt_key = get_rss_str("RSS_BILIBILI_ALT_KEY", "bilibili-alt.xml");
        cfg.rss.douban_key = get_rss_str("RSS_DOUBAN_KEY", "douban.xml");
        cfg.rss.bilibili_title = get_rss_str("RSS_BILIBILI_TITLE", "B站关注动态");
        cfg.rss.zhihu_title = get_rss_str("RSS_ZHIHU_TITLE", "知乎关注动态");
        cfg.rss.bilibili_alt_title = get_rss_str("RSS_BILIBILI_ALT_TITLE", "B站小号关注动态");
        cfg.rss.douban_title = get_rss_str("RSS_DOUBAN_TITLE", "豆瓣关注动态");
        cfg.rss.bilibili_desc = get_rss_str("RSS_BILIBILI_DESC", "我的B站关注列表的最新动态");
        cfg.rss.zhihu_desc = get_rss_str("RSS_ZHIHU_DESC", "我的知乎关注列表的最新动态");
        cfg.rss.bilibili_alt_desc = get_rss_str("RSS_BILIBILI_ALT_DESC", "我的B站小号关注列表的最新动态");
        cfg.rss.douban_desc = get_rss_str("RSS_DOUBAN_DESC", "我的豆瓣关注列表的最新动态");
        cfg.rss.max_items = get_usize("RSS_MAX_ITEMS", 200);

        cfg
    }

    pub fn save_key_to_env<P: AsRef<Path>>(path: P, key: &str, val: &str) -> std::io::Result<()> {
        let path = path.as_ref();
        let content = if path.exists() {
            fs::read_to_string(path)?
        } else {
            String::new()
        };

        let mut lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();
        let mut found = false;
        let prefix = format!("{}=", key);

        for line in lines.iter_mut() {
            if line.trim().starts_with(&prefix) || line.trim() == key {
                *line = format!("{}={}", key, val);
                found = true;
                break;
            }
        }

        if !found {
            lines.push(format!("{}={}", key, val));
        }

        fs::write(path, lines.join("\n") + "\n")
    }
}
