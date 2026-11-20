use rss_engine::config::AppConfig;
use rss_engine::scheduler::start_scheduler;
use rss_engine::server::{create_router, AppState};
use rss_engine::storage::DataStore;
use std::collections::VecDeque;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::Instant;
use tracing::info;

use std::io::{self, Write};

struct SafeStdout;

impl Write for SafeStdout {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        let mut stdout = io::stdout();
        match stdout.write(buf) {
            Ok(n) => Ok(n),
            Err(_) => Ok(buf.len()), // Silently ignore broken pipe when parent closes stdio
        }
    }

    fn flush(&mut self) -> io::Result<()> {
        let mut stdout = io::stdout();
        let _ = stdout.flush();
        Ok(())
    }
}

impl<'a> tracing_subscriber::fmt::MakeWriter<'a> for SafeStdout {
    type Writer = SafeStdout;
    fn make_writer(&'a self) -> Self::Writer {
        SafeStdout
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_writer(SafeStdout)
        .with_ansi(false)
        .with_env_filter("info")
        .init();

    let env_file = Path::new(".env");
    let config = Arc::new(Mutex::new(AppConfig::load_from_env_file(env_file)));

    let cfg_clone = { config.lock().unwrap().clone() };
    let store = DataStore::new(&cfg_clone.data_dir);

    info!("========================================");
    info!("   🚀 RSS 动态服务 Engine (Rust 版)");
    info!("========================================");
    info!("  端口: {}", cfg_clone.port);
    info!("  数据目录: {}", cfg_clone.data_dir);
    info!("  抓取间隔: {} 分钟", cfg_clone.fetch.interval_minutes);
    info!("  R2 配置: {}", if !cfg_clone.r2.account_id.is_empty() { "✅ 已配置" } else { "❌ 未配置" });
    info!("  B站 Cookie: {}", if !cfg_clone.bilibili.cookie.is_empty() || !cfg_clone.bilibili.sessdata.is_empty() { "✅ 已配置" } else { "❌ 未配置" });
    info!("  知乎 Cookie: {}", if !cfg_clone.zhihu.cookie.is_empty() { "✅ 已配置" } else { "❌ 未配置" });
    info!("  豆瓣 Cookie: {}", if !cfg_clone.douban.cookie.is_empty() { "✅ 已配置" } else { "❌ 未配置" });
    info!("========================================");

    // Start background scheduler
    start_scheduler(Arc::clone(&config), store.clone());

    let state = AppState {
        config: Arc::clone(&config),
        store,
        start_time: Instant::now(),
        logs: Arc::new(Mutex::new(VecDeque::new())),
    };

    let app = create_router(state);
    let addr = format!("0.0.0.0:{}", cfg_clone.port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    info!("📡 HTTP 服务已监听: http://localhost:{}", cfg_clone.port);

    axum::serve(listener, app).await?;
    Ok(())
}
