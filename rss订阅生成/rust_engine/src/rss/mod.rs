use crate::config::AppConfig;
use crate::storage::DynamicItem;
use chrono::{DateTime, Utc};
use regex::Regex;
use std::collections::HashSet;

const IMAGE_PROXY_PREFIX: &str = "https://wsrv.nl/?url=";

pub fn proxy_image(url: &str) -> String {
    if url.is_empty() {
        return String::new();
    }
    let full_url = if url.starts_with("//") {
        format!("https:{}", url)
    } else {
        url.to_string()
    };

    if full_url.starts_with(IMAGE_PROXY_PREFIX) {
        return full_url;
    }

    if needs_proxy(&full_url) {
        format!("{}{}", IMAGE_PROXY_PREFIX, urlencoding::encode(&full_url))
    } else {
        full_url
    }
}

fn needs_proxy(url: &str) -> bool {
    let proxy_domains = [
        "hdslb.com",
        "bilivideo.com",
        "biliimg.com",
        "bilibili.com",
        "zhimg.com",
        "zhihu.com",
        "doubanio.com",
    ];
    if let Ok(parsed) = url::Url::parse(url) {
        if let Some(host) = parsed.host_str() {
            return proxy_domains.iter().any(|d| host.ends_with(d));
        }
    }
    false
}

pub fn generate_rss(config: &AppConfig, platform: &str, items: &[DynamicItem]) -> String {
    let (feed_title, feed_desc) = match platform {
        "bilibili" => (&config.rss.bilibili_title, &config.rss.bilibili_desc),
        "zhihu" => (&config.rss.zhihu_title, &config.rss.zhihu_desc),
        "bilibili-alt" => (&config.rss.bilibili_alt_title, &config.rss.bilibili_alt_desc),
        "douban" => (&config.rss.douban_title, &config.rss.douban_desc),
        _ => (&config.rss.bilibili_title, &config.rss.bilibili_desc),
    };

    let site_url = match platform {
        "zhihu" => "https://www.zhihu.com",
        "douban" => "https://www.douban.com",
        _ => "https://www.bilibili.com",
    };

    let mut xml = String::new();
    xml.push_str(r#"<?xml version="1.0" encoding="UTF-8"?>"#);
    xml.push_str(r#"<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">"#);
    xml.push_str("<channel>\n");
    xml.push_str(&format!("  <title>{}</title>\n", xml_escape(feed_title)));
    xml.push_str(&format!("  <description>{}</description>\n", xml_escape(feed_desc)));
    xml.push_str(&format!("  <link>{}</link>\n", site_url));
    xml.push_str("  <language>zh-CN</language>\n");
    xml.push_str(&format!("  <lastBuildDate>{}</lastBuildDate>\n", Utc::now().to_rfc2822()));
    xml.push_str("  <generator>RSS Engine Rust</generator>\n");

    let filtered_items: Vec<&DynamicItem> = items
        .iter()
        .filter(|item| {
            if platform == "bilibili" {
                !(config.bilibili.video_only && item.item_type != "DYNAMIC_TYPE_AV")
                    && !crate::fetcher::bilibili::is_bilibili_item_blocked(item, &config.bilibili.block_keywords)
            } else {
                true
            }
        })
        .take(config.rss.max_items)
        .collect();

    for item in filtered_items {
        xml.push_str("  <item>\n");
        xml.push_str(&format!("    <title>{}</title>\n", xml_escape(&item.title)));
        xml.push_str(&format!("    <link>{}</link>\n", xml_escape(&item.link)));
        xml.push_str(&format!("    <guid isPermaLink=\"false\">{}</guid>\n", xml_escape(&item.id)));

        let dt = DateTime::from_timestamp_millis(item.publish_time).unwrap_or_else(Utc::now);
        xml.push_str(&format!("    <pubDate>{}</pubDate>\n", dt.to_rfc2822()));
        xml.push_str(&format!("    <author>{}</author>\n", xml_escape(&item.author)));

        let html_content = build_content_html(config, item);
        xml.push_str(&format!("    <content:encoded><![CDATA[{}]]></content:encoded>\n", html_content));

        // First image as enclosure (正文图片或视频封面，绝不用作者头像，
        // 否则阅读器会把头像当成大图封面显示)
        let first_img = if !item.images.is_empty() {
            &item.images[0]
        } else if !item.video_cover.is_empty() {
            &item.video_cover
        } else {
            ""
        };

        if !first_img.is_empty() {
            let proxied = proxy_image(first_img);
            xml.push_str(&format!(
                r#"    <enclosure url="{}" type="image/jpeg" length="0" />"#,
                xml_escape(&proxied)
            ));
            xml.push('\n');
        }

        xml.push_str("  </item>\n");
    }

    xml.push_str("</channel>\n</rss>\n");
    xml
}

fn build_content_html(config: &AppConfig, item: &DynamicItem) -> String {
    let mut parts = Vec::new();
    let is_douban = item.platform == "douban";

    // 豆瓣：置顶隐藏 0 尺寸的正文图片副本，防止部分阅读器把下方的小头像
    // 提取为封面/摘要大图（参考 RSSHub 的 picsPrefixes 处理）
    if is_douban {
        for img in item.images.iter().take(3) {
            parts.push(format!(
                r#"<img width="0" height="0" hidden="true" src="{}" referrerpolicy="no-referrer">"#,
                proxy_image(img)
            ));
        }
    }

    // Render Author
    if !item.author.is_empty() {
        if is_douban && !item.author_face.is_empty() {
            // 豆瓣：小尺寸圆形头像 + 作者名 + 动作，替代突兀的大头像
            let activity = if item.item_type.is_empty() {
                String::new()
            } else {
                format!("&ensp;{}:", xml_escape(&item.item_type))
            };
            parts.push(format!(
                r#"<p><img src="{}" style="width:48px;height:48px;border-radius:50%;vertical-align:middle;margin-right:6px" referrerpolicy="no-referrer" /><strong>{}</strong>{}</p>"#,
                proxy_image(&item.author_face),
                xml_escape(&item.author),
                activity
            ));
        } else {
            parts.push(format!("<p><strong>{}</strong></p>", xml_escape(&item.author)));
        }
    }

    // Main text
    if !item.content.is_empty() {
        let mut text = item.content.clone();
        // Replace emojis for bilibili
        if !item.emojis.is_empty() {
            for (code, icon_url) in &item.emojis {
                let img_tag = format!(
                    r#"<img alt="{}" src="{}" style="margin:-1px 1px 0;display:inline-block;width:20px;height:20px;vertical-align:text-bottom" referrerpolicy="no-referrer">"#,
                    xml_escape(code),
                    proxy_image(icon_url)
                );
                text = text.replace(code, &img_tag);
            }
        }
        parts.push(sanitize_html(&text));
    }

    // Images
    for img in &item.images {
        let src = proxy_image(img);
        parts.push(format!(r#"<p><img src="{}" style="max-width:100%" referrerpolicy="no-referrer" /></p>"#, src));
    }

    // Video cover
    if !item.video_cover.is_empty() && !item.images.contains(&item.video_cover) {
        let src = proxy_image(&item.video_cover);
        let mut cover_html = format!(r#"<img src="{}" style="max-width:100%" referrerpolicy="no-referrer" />"#, src);
        if !item.video_duration.is_empty() {
            cover_html = format!(
                r#"<div style="position:relative;display:inline-block">{}<span style="position:absolute;right:4px;bottom:4px;background:rgba(0,0,0,.7);color:#fff;padding:1px 4px;border-radius:2px;font-size:12px">{}</span></div>"#,
                cover_html, item.video_duration
            );
        }
        parts.push(format!("<p>{}</p>", cover_html));
    }

    // Embed player for Bilibili
    if config.render.bilibili_embed_player && !item.video_bvid.is_empty() {
        parts.push(format!(
            r#"<p><iframe src="https://www.bilibili.com/blackboard/html5mobileplayer.html?bvid={}&high_quality=1&autoplay=0" width="650" height="477" scrolling="no" border="0" frameborder="no" framespacing="0" allowfullscreen="true"></iframe></p>"#,
            item.video_bvid
        ));
    }

    // Forward dynamic blockquote
    if let Some(ref orig) = item.orig_dynamic {
        let mut orig_parts = Vec::new();
        if !orig.author.is_empty() {
            orig_parts.push(format!("<strong>@{}</strong>", xml_escape(&orig.author)));
        }
        if !orig.title.is_empty() {
            orig_parts.push(format!("<p>{}</p>", xml_escape(&orig.title)));
        }
        if !orig.content.is_empty() {
            orig_parts.push(format!("<p>{}</p>", xml_escape(&orig.content)));
        }
        for img in &orig.images {
            orig_parts.push(format!(r#"<p><img src="{}" style="max-width:100%" referrerpolicy="no-referrer" /></p>"#, proxy_image(img)));
        }
        parts.push(format!(
            r#"<blockquote style="border-left:3px solid #00a1d6;padding:8px 12px;margin:8px 0;background:#f4f5f7">{}</blockquote>"#,
            orig_parts.join("\n")
        ));
    }

    parts.join("\n")
}

pub fn sanitize_html(html: &str) -> String {
    // Whitelist allowed tags
    let allowed: HashSet<&str> = [
        "b", "i", "strong", "em", "a", "br", "p", "blockquote",
        "ul", "ol", "li", "h2", "h3", "h4", "img", "figure", "figcaption", "video",
        "div", "span", "pre", "code", "table", "tr", "td", "th",
    ].into_iter().collect();

    let re_tag = Regex::new(r"(?i)</?([a-z0-9]+)\b([^>]*)>").unwrap();
    re_tag.replace_all(html, |caps: &regex::Captures| {
        let tag = caps[1].to_lowercase();
        if !allowed.contains(tag.as_str()) {
            return String::new();
        }
        caps[0].to_string()
    }).to_string()
}

fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::DynamicStats;
    use std::collections::HashMap;

    #[test]
    fn test_generate_rss_filters_bilibili_non_video_only() {
        let mut cfg = AppConfig::default();
        cfg.bilibili.block_keywords = vec!["外卖".to_string()];

        let make = |id: &str, item_type: &str, title: &str| DynamicItem {
            id: id.to_string(),
            platform: "bilibili".to_string(),
            item_type: item_type.to_string(),
            author: "UP".to_string(),
            author_face: String::new(),
            author_mid: None,
            author_url: None,
            title: title.to_string(),
            raw_title: title.to_string(),
            content: String::new(),
            link: format!("https://www.bilibili.com/opus/{}", id),
            images: vec![],
            video_cover: String::new(),
            video_duration: String::new(),
            video_bvid: String::new(),
            emojis: HashMap::new(),
            orig_dynamic: None,
            publish_time: 0,
            stats: DynamicStats::default(),
        };

        let items = vec![
            make("1", "DYNAMIC_TYPE_OPUS", "领外卖红包"),
            make("2", "DYNAMIC_TYPE_AV", "外卖员的一天"),
        ];

        let xml = generate_rss(&cfg, "bilibili", &items);
        assert!(!xml.contains("领外卖红包"));
        assert!(xml.contains("外卖员的一天"));
    }

    #[test]
    fn test_generate_rss_bilibili_video_only() {
        let mut cfg = AppConfig::default();
        cfg.bilibili.video_only = true;

        let make = |id: &str, item_type: &str, title: &str| DynamicItem {
            id: id.to_string(),
            platform: "bilibili".to_string(),
            item_type: item_type.to_string(),
            author: "UP".to_string(),
            author_face: String::new(),
            author_mid: None,
            author_url: None,
            title: title.to_string(),
            raw_title: title.to_string(),
            content: String::new(),
            link: format!("https://www.bilibili.com/opus/{}", id),
            images: vec![],
            video_cover: String::new(),
            video_duration: String::new(),
            video_bvid: String::new(),
            emojis: HashMap::new(),
            orig_dynamic: None,
            publish_time: 0,
            stats: DynamicStats::default(),
        };

        let items = vec![
            make("1", "DYNAMIC_TYPE_OPUS", "普通图文动态"),
            make("2", "DYNAMIC_TYPE_AV", "新视频投稿"),
        ];

        let xml = generate_rss(&cfg, "bilibili", &items);
        assert!(!xml.contains("普通图文动态"));
        assert!(xml.contains("新视频投稿"));
    }
}
