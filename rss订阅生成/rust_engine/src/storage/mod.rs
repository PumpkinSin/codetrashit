use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DynamicItem {
    pub id: String,
    pub platform: String,
    #[serde(rename = "type")]
    pub item_type: String,
    pub author: String,
    #[serde(rename = "authorFace", default)]
    pub author_face: String,
    #[serde(rename = "authorMid", skip_serializing_if = "Option::is_none")]
    pub author_mid: Option<String>,
    #[serde(rename = "authorUrl", skip_serializing_if = "Option::is_none")]
    pub author_url: Option<String>,
    pub title: String,
    #[serde(rename = "rawTitle", default)]
    pub raw_title: String,
    pub content: String,
    pub link: String,
    #[serde(default)]
    pub images: Vec<String>,
    #[serde(rename = "videoCover", default)]
    pub video_cover: String,
    #[serde(rename = "videoDuration", default)]
    pub video_duration: String,
    #[serde(rename = "videoBvid", default)]
    pub video_bvid: String,
    #[serde(default)]
    pub emojis: HashMap<String, String>,
    #[serde(rename = "origDynamic", skip_serializing_if = "Option::is_none")]
    pub orig_dynamic: Option<Box<OrigDynamic>>,
    #[serde(rename = "publishTime")]
    pub publish_time: i64,
    #[serde(default)]
    pub stats: DynamicStats,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct OrigDynamic {
    #[serde(rename = "type", default)]
    pub item_type: String,
    #[serde(default)]
    pub author: String,
    #[serde(rename = "authorFace", default)]
    pub author_face: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub content: String,
    #[serde(default)]
    pub link: String,
    #[serde(default)]
    pub images: Vec<String>,
    #[serde(rename = "videoCover", default)]
    pub video_cover: String,
    #[serde(rename = "videoDuration", default)]
    pub video_duration: String,
    #[serde(rename = "videoBvid", default)]
    pub video_bvid: String,
    #[serde(default)]
    pub emojis: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DynamicStats {
    #[serde(default)]
    pub like: u64,
    #[serde(default)]
    pub view: u64,
    #[serde(default)]
    pub comment: u64,
    #[serde(default)]
    pub forward: u64,
    #[serde(default)]
    pub danmaku: u64,
    #[serde(default)]
    pub reshare: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MergeResult {
    #[serde(rename = "totalCount")]
    pub total_count: usize,
    #[serde(rename = "newCount")]
    pub new_count: usize,
}

#[derive(Clone)]
pub struct DataStore {
    data_dir: PathBuf,
}

impl DataStore {
    pub fn new<P: AsRef<Path>>(data_dir: P) -> Self {
        let p = data_dir.as_ref().to_path_buf();
        if !p.exists() {
            let _ = fs::create_dir_all(&p);
        }
        Self { data_dir: p }
    }

    fn file_path(&self, platform: &str) -> PathBuf {
        let filename = match platform {
            "bilibili" => "bilibili.json",
            "zhihu" => "zhihu.json",
            "bilibili-alt" => "bilibili-alt.json",
            "douban" => "douban.json",
            _ => "unknown.json",
        };
        self.data_dir.join(filename)
    }

    pub fn load(&self, platform: &str) -> Vec<DynamicItem> {
        let path = self.file_path(platform);
        if !path.exists() {
            return Vec::new();
        }
        match fs::read_to_string(&path) {
            Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
            Err(_) => Vec::new(),
        }
    }

    pub fn save(&self, platform: &str, items: &[DynamicItem]) -> anyhow::Result<()> {
        let path = self.file_path(platform);
        let json = serde_json::to_string_pretty(items)?;
        fs::write(path, json)?;
        Ok(())
    }

    pub fn merge(&self, platform: &str, new_items: Vec<DynamicItem>, max_items: usize) -> MergeResult {
        let existing = self.load(platform);
        let existing_ids: HashSet<String> = existing.iter().map(|i| i.id.clone()).collect();

        let unique_new: Vec<DynamicItem> = new_items
            .into_iter()
            .filter(|i| !existing_ids.contains(&i.id))
            .collect();

        let new_count = unique_new.len();
        if new_count == 0 {
            return MergeResult {
                total_count: existing.len(),
                new_count: 0,
            };
        }

        let mut merged = unique_new;
        merged.extend(existing);

        // Sort descending by publish_time
        merged.sort_by(|a, b| b.publish_time.cmp(&a.publish_time));

        if merged.len() > max_items {
            merged.truncate(max_items);
        }

        let total_count = merged.len();
        let _ = self.save(platform, &merged);

        MergeResult {
            total_count,
            new_count,
        }
    }

    pub fn clear(&self, platform: &str) {
        let _ = self.save(platform, &[]);
    }
}
