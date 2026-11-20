pub mod bilibili;
pub mod douban;
pub mod zhihu;

use crate::config::AppConfig;
use crate::storage::DataStore;
use anyhow::Result;
use tracing::info;

pub async fn run_all_fetchers(config: &AppConfig, store: &DataStore) -> Result<()> {
    info!("[Fetcher] 开始全平台抓取任务...");

    // Bilibili Main
    if !config.bilibili.cookie.is_empty() || !config.bilibili.sessdata.is_empty() {
        let _ = bilibili::fetch_and_store(config, store, "bilibili", false).await;
    }

    // Bilibili Alt (if has independent cookie)
    if !config.bilibili_alt.cookie.is_empty() || !config.bilibili_alt.sessdata.is_empty() {
        let _ = bilibili::fetch_and_store(config, store, "bilibili-alt", true).await;
    }

    // Zhihu
    if !config.zhihu.cookie.is_empty() {
        let _ = zhihu::fetch_and_store(config, store).await;
    }

    // Douban
    if !config.douban.cookie.is_empty() {
        let _ = douban::fetch_and_store(config, store).await;
    }

    info!("[Fetcher] 全平台抓取任务完成");
    Ok(())
}
