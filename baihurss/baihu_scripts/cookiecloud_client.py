#!/usr/bin/env python3
"""
CookieCloud 客户端（兼容 CryptoJS AES-256-CBC OpenSSL Salted__ 格式）
优先使用 pycryptodome，无第三方加密库时自动回退调用系统 openssl 命令。
"""

import base64
import hashlib
import json
import subprocess
import requests


def _evp_bytes_to_key(password: bytes, salt: bytes, key_len: int = 32, iv_len: int = 16):
    d = b""
    d_i = b""
    while len(d) < key_len + iv_len:
        d_i = hashlib.md5(d_i + password + salt).digest()
        d += d_i
    return d[:key_len], d[key_len : key_len + iv_len]


def _decrypt_cryptojs(encrypted_b64: str, passphrase: str) -> str:
    raw = base64.b64decode(encrypted_b64)
    if not raw.startswith(b"Salted__"):
        raise ValueError("Invalid CookieCloud encrypted payload (missing Salted__ header)")
    salt = raw[8:16]
    ct = raw[16:]

    # 优先使用 pycryptodome
    try:
        from Crypto.Cipher import AES

        key, iv = _evp_bytes_to_key(passphrase.encode("utf-8"), salt)
        cipher = AES.new(key, AES.MODE_CBC, iv)
        pt = cipher.decrypt(ct)
        pad = pt[-1]
        if 1 <= pad <= 16:
            pt = pt[:-pad]
        return pt.decode("utf-8")
    except ImportError:
        pass

    # 回退使用系统 openssl
    proc = subprocess.run(
        ["openssl", "enc", "-d", "-aes-256-cbc", "-md", "md5", "-base64", "-A", "-pass", f"pass:{passphrase}"],
        input=encrypted_b64.encode("utf-8"),
        capture_output=True,
        check=True,
    )
    return proc.stdout.decode("utf-8")


def fetch_cookie_dict(server_url: str, uuid: str, password: str, timeout: int = 15) -> dict:
    """从 CookieCloud 拉取并解密全部域名 Cookie，返回 {domain: [cookie_obj, ...]}。"""
    url = f"{server_url.rstrip('/')}/get/{uuid}"
    resp = requests.get(url, timeout=timeout)
    resp.raise_for_status()
    data = resp.json()
    encrypted = data.get("encrypted")
    if not encrypted:
        raise ValueError("CookieCloud response missing 'encrypted' field")

    key_hash = hashlib.md5(f"{uuid}-{password}".encode("utf-8")).hexdigest()[:16]
    plaintext = _decrypt_cryptojs(encrypted, key_hash)
    parsed = json.loads(plaintext)
    return parsed.get("cookie_data", {})


def get_domain_cookie_string(cookie_data: dict, target_domain: str) -> str:
    """将指定主域名及其子域名的 Cookie 合并为标准 HTTP Cookie 请求头字符串。"""
    target = target_domain.lstrip(".").lower()
    merged = {}
    for domain, items in cookie_data.items():
        d = domain.lstrip(".").lower()
        if d == target or d.endswith("." + target) or target.endswith("." + d):
            for c in items:
                name = c.get("name")
                val = c.get("value")
                if name is not None and val is not None:
                    merged[name] = val
    return "; ".join(f"{k}={v}" for k, v in merged.items())
