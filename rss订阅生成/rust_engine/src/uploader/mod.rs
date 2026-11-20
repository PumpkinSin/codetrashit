use crate::config::AppConfig;
use anyhow::{anyhow, Result};
use chrono::Utc;
use hmac::{Hmac, Mac};
use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE};
use sha2::{Digest, Sha256};
use std::time::Duration;
use tracing::info;

type HmacSha256 = Hmac<Sha256>;

pub async fn upload_r2(
    config: &AppConfig,
    key: &str,
    xml_content: &str,
) -> Result<String> {
    let r2 = &config.r2;
    if r2.account_id.is_empty() || r2.access_key_id.is_empty() || r2.secret_access_key.is_empty() {
        return Err(anyhow!("R2 配置不完整，请检查 CF_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY"));
    }

    let bucket = &r2.bucket_name;
    let host = format!("{}.r2.cloudflarestorage.com", r2.account_id);
    let region = "auto";
    let service = "s3";
    let canonical_uri = format!("/{}/{}", bucket, key);
    let canonical_querystring = "";
    let url = format!("https://{}{}", host, canonical_uri);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(45))
        .pool_idle_timeout(Duration::from_secs(90))
        .build()?;

    let mut last_err = anyhow!("上传失败");

    for attempt in 1..=3 {
        let now = Utc::now();
        let amz_date = now.format("%Y%m%dT%H%M%SZ").to_string();
        let date_stamp = now.format("%Y%m%d").to_string();

        let payload_bytes = xml_content.as_bytes();
        let payload_hash = hex::encode(Sha256::digest(payload_bytes));

        let canonical_headers = format!(
            "content-type:application/rss+xml; charset=utf-8\nhost:{}\nx-amz-content-sha256:{}\nx-amz-date:{}\n",
            host, payload_hash, amz_date
        );
        let signed_headers = "content-type;host;x-amz-content-sha256;x-amz-date";

        let canonical_request = format!(
            "PUT\n{}\n{}\n{}\n{}\n{}",
            canonical_uri, canonical_querystring, canonical_headers, signed_headers, payload_hash
        );

        let canonical_request_hash = hex::encode(Sha256::digest(canonical_request.as_bytes()));

        let credential_scope = format!("{}/{}/{}/aws4_request", date_stamp, region, service);
        let string_to_sign = format!(
            "AWS4-HMAC-SHA256\n{}\n{}\n{}",
            amz_date, credential_scope, canonical_request_hash
        );

        // Compute signing key
        let k_secret = format!("AWS4{}", r2.secret_access_key);
        let k_date = hmac_sha256(k_secret.as_bytes(), date_stamp.as_bytes())?;
        let k_region = hmac_sha256(&k_date, region.as_bytes())?;
        let k_service = hmac_sha256(&k_region, service.as_bytes())?;
        let k_signing = hmac_sha256(&k_service, b"aws4_request")?;

        let signature = hex::encode(hmac_sha256(&k_signing, string_to_sign.as_bytes())?);

        let auth_header = format!(
            "AWS4-HMAC-SHA256 Credential={}/{}, SignedHeaders={}, Signature={}",
            r2.access_key_id, credential_scope, signed_headers, signature
        );

        let mut headers = HeaderMap::new();
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/rss+xml; charset=utf-8"));
        headers.insert("host", HeaderValue::from_str(&host)?);
        headers.insert("x-amz-date", HeaderValue::from_str(&amz_date)?);
        headers.insert("x-amz-content-sha256", HeaderValue::from_str(&payload_hash)?);
        headers.insert("Authorization", HeaderValue::from_str(&auth_header)?);

        match client.put(&url).headers(headers).body(xml_content.to_string()).send().await {
            Ok(resp) => {
                if resp.status().is_success() {
                    let public_url = if !r2.public_url.is_empty() {
                        format!("{}/{}", r2.public_url.trim_end_matches('/'), key)
                    } else {
                        format!("(未配置公开URL) {}", key)
                    };
                    info!("[R2] 上传成功: {}", public_url);
                    return Ok(public_url);
                } else {
                    let status = resp.status();
                    let err_text = resp.text().await.unwrap_or_default();
                    last_err = anyhow!("R2 上传返回错误: HTTP {} - {}", status, err_text);
                }
            }
            Err(e) => {
                tracing::warn!("[R2] 上传 {} 遇到网络波动 (尝试 {}/3): {}", key, attempt, e);
                last_err = anyhow!("网络请求失败: {}", e);
            }
        }

        if attempt < 3 {
            tokio::time::sleep(Duration::from_millis(1500 * attempt as u64)).await;
        }
    }

    Err(last_err)
}

fn hmac_sha256(key: &[u8], data: &[u8]) -> Result<Vec<u8>> {
    let mut mac = HmacSha256::new_from_slice(key).map_err(|e| anyhow!("{}", e))?;
    mac.update(data);
    Ok(mac.finalize().into_bytes().to_vec())
}
