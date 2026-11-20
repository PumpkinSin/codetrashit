# -*- coding: utf-8 -*-
"""EPUB 结构自检:ZIP 布局、container、manifest/spine 一致性、XHTML 引用。"""
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

path = sys.argv[1]
z = zipfile.ZipFile(path)
infos = z.infolist()
first = infos[0]
print("第一个条目:", first.filename, "| 压缩:", first.compress_type, "(0=STORED 才合规)")
print("mimetype 内容:", z.read("mimetype").decode())
print("条目总数:", len(infos))

names = z.namelist()
print("container.xml:", "META-INF/container.xml" in names)

container = z.read("META-INF/container.xml").decode()
rootfile = re.search(r'full-path="([^"]+)"', container).group(1)
print("OPF 路径:", rootfile, "| 存在:", rootfile in names)

opf = z.read(rootfile).decode()
opf_dir = rootfile.rsplit("/", 1)[0] + "/" if "/" in rootfile else ""

hrefs = re.findall(r'href="([^"]+)"', opf)
missing = []
for h in hrefs:
    if h.startswith("http"):
        continue
    full = (opf_dir + h).replace("\\", "/")
    if full not in [n.replace("\\", "/") for n in names]:
        missing.append(h)
print("manifest 引用缺失:", missing or "无")

ids_manifest = set(re.findall(r'<item[^>]*?id="([^"]+)"', opf))
spine = re.findall(r'<itemref[^>]*?idref="([^"]+)"', opf)
bad_spine = [s for s in spine if s not in ids_manifest]
print("spine 引用缺失:", bad_spine or "无")

nav_ok = 'properties="nav"' in opf
print("nav 属性声明:", nav_ok)

# XHTML 内部资源引用(图片/CSS)
xhtml_missing = []
for n in names:
    if n.endswith(".xhtml"):
        data = z.read(n).decode("utf-8", "ignore")
        for h in re.findall(r'(?:src|href)="(book_assets/[^"]+|images/[^"]+|style/[^"]+)"', data):
            full = (opf_dir + h).replace("\\", "/")
            if full not in [x.replace("\\", "/") for x in names]:
                xhtml_missing.append((n, h))
print("XHTML 资源引用缺失:", xhtml_missing[:5] or "无")
