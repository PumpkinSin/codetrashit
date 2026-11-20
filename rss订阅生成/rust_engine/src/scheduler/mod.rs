use crate::config::AppConfig;
use crate::fetcher;
use crate::rss::generate_rss;
use crate::storage::DataStore;
use crate::uploader::upload_r2;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tracing::{error, info};

pub fn start_scheduler(config: Arc<Mutex<AppConfig>>, store: DataStore) {
    tokio::spawn(async move {
        // Initial wait 10s
        tokio::time::sleep(Duration::from_secs(10)).await;

        loop {
            let env_path = std::path::Path::new(".env");
            if env_path.exists() {
                let new_cfg = AppConfig::load_from_env_file(env_path);
                *config.lock().unwrap() = new_cfg;
            }
            let current_cfg = { config.lock().unwrap().clone() };
            let interval = current_cfg.fetch.interval_minutes.max(1);

            info!("[Scheduler] ========== 开始定时任务 ==========");
            let start = std::time::Instant::now();

            if let Err(e) = fetcher::run_all_fetchers(&current_cfg, &store).await {
                error!("[Scheduler] 抓取任务失败: {}", e);
            }

            if env_path.exists() {
                let new_cfg = AppConfig::load_from_env_file(env_path);
                *config.lock().unwrap() = new_cfg;
            }

            if current_cfg.auto_sync {
                for platform in ["bilibili", "zhihu", "douban"] {
                    let items = store.load(platform);
                    if !items.is_empty() {
                        let xml = generate_rss(&current_cfg, platform, &items);
                        let key = match platform {
                            "bilibili" => &current_cfg.rss.bilibili_key,
                            "zhihu" => &current_cfg.rss.zhihu_key,
                            "douban" => &current_cfg.rss.douban_key,
                            _ => "",
                        };
                        if !key.is_empty() {
                            if let Err(e) = upload_r2(&current_cfg, key, &xml).await {
                                error!("[Scheduler] 自动同步 {} 到 R2 失败: {}", platform, e);
                            }
                            // 平台间间隔 1.5 秒，避免海外 Cloudflare edge 在毫秒级内遭遇并发连接重置
                            tokio::time::sleep(Duration::from_millis(1500)).await;
                        }
                    }
                }
            }

            let elapsed = start.elapsed().as_secs();
            info!("[Scheduler] ========== 定时任务完成 (耗时 {}s) ==========", elapsed);

            tokio::time::sleep(Duration::from_secs(interval * 60)).await;
        }
    });
}
