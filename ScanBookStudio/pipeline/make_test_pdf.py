# -*- coding: utf-8 -*-
"""生成合成测试 PDF:文本层页 + 扫描页混合,含脚注/双栏/表格/图片/书签。"""
import sys
from pathlib import Path

import pymupdf

sys.path.insert(0, str(Path(__file__).parent))
from common import WORK_DIR, get_logger

log = get_logger("make_test_pdf")

FONT_CANDIDATES = [
    r"C:\Windows\Fonts\msyh.ttc",
    r"C:\Windows\Fonts\simhei.ttf",
    r"C:\Windows\Fonts\simsun.ttc",
]


def pick_font() -> str:
    for p in FONT_CANDIDATES:
        if Path(p).exists():
            return p
    raise RuntimeError("未找到中文字体")


def make_figure_image() -> bytes:
    """生成一张简单图表 PNG(渐变+柱状图),供 image 区块检测。"""
    from PIL import Image, ImageDraw
    img = Image.new("RGB", (420, 260), "#f4f4f8")
    dr = ImageDraw.Draw(img)
    bars = [(60, 160, "A", "#5b8ff9"), (150, 110, "B", "#5ad8a6"),
            (240, 190, "C", "#f6bd16"), (330, 90, "D", "#e8684a")]
    for x, h, label, color in bars:
        dr.rectangle([x, 220 - h, x + 50, 220], fill=color)
        dr.text((x + 18, 225), label, fill="#333")
    dr.line([(20, 220), (400, 220)], fill="#666", width=2)
    import io
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def textbox(page, rect, text, fontsize=10.5, fontfile=None, fontname="zh", align=0):
    page.insert_font(fontname=fontname, fontfile=fontfile)
    page.insert_textbox(rect, text, fontsize=fontsize, fontname=fontname, align=align)


def draw_header_footer(page, header, footer, fontfile):
    textbox(page, pymupdf.Rect(70, 36, 525, 52), header, fontsize=8.5, fontfile=fontfile)
    textbox(page, pymupdf.Rect(280, 790, 315, 806), footer, fontsize=9, fontfile=fontfile)


def superscript(page, x, y, marker, fontfile, size_main=10.5):
    """在 (x,y) 基线处写上标标记,返回结束后的 x。"""
    font = pymupdf.Font(fontfile=fontfile)
    page.insert_font(fontname="zh", fontfile=fontfile)
    tw = pymupdf.TextWriter(page.rect)
    tw.append((x, y), marker, font=font, fontsize=size_main * 0.62)
    tw.write_text(page)
    return x + font.text_length(marker, fontsize=size_main * 0.62)


def page1_content(page, fontfile, scan_like=False):
    """第一章:标题+正文+脚注①②+表格+图片。"""
    draw_header_footer(page, "测试书籍 · 第一章 绪论", "1", fontfile)
    textbox(page, pymupdf.Rect(70, 70, 525, 100), "第一章 绪论", fontsize=17, fontfile=fontfile)
    textbox(page, pymupdf.Rect(70, 104, 525, 200),
            "文档解析是连接非结构化文档与数字阅读的关键技术。近年来,随着多模态模型的"
            "发展,版面分析与文字识别的精度得到了显著提升①。本章节将围绕三个核心问题展开:"
            "如何恢复多栏阅读顺序、如何保留脚注的对应关系、以及如何将识别结果转换为"
            "便于电子阅读器呈现的结构化数据②。", fontsize=10.5, fontfile=fontfile)
    textbox(page, pymupdf.Rect(70, 205, 525, 300),
            "传统 OCR 管线通常把检测、识别、版面理解拆分为独立模块,而端到端方案则让"
            "视觉语言模型直接输出结构化内容。两种路线各有取舍:前者速度快、可解释性强,"
            "后者对复杂版面与手写内容更鲁棒。本研究采用混合架构,兼顾速度与质量。",
            fontsize=10.5, fontfile=fontfile)
    # 表格
    rows, cols = 3, 4
    x0, y0, cw, chh = 70, 320, 110, 24
    grid = (0.27, 0.27, 0.27)
    for r in range(rows + 1):
        page.draw_line(pymupdf.Point(x0, y0 + r * chh), pymupdf.Point(x0 + cols * cw, y0 + r * chh),
                       color=grid, width=0.8)
    for c in range(cols + 1):
        page.draw_line(pymupdf.Point(x0 + c * cw, y0), pymupdf.Point(x0 + c * cw, y0 + rows * chh),
                       color=grid, width=0.8)
    table_data = [["模型", "准确率", "速度", "显存"],
                  ["基线管线", "91.2%", "快", "低"],
                  ["端到端模型", "96.3%", "中", "中"]]
    font = pymupdf.Font(fontfile=fontfile)
    for r in range(rows):
        for c in range(cols):
            cell = table_data[r][c]
            w = font.text_length(cell, fontsize=9.5)
            page.insert_font(fontname="zh", fontfile=fontfile)
            page.insert_text((x0 + c * cw + 12, y0 + r * chh + 16), cell,
                             fontsize=9.5, fontname="zh")
    # 图片
    page.insert_image(pymupdf.Rect(120, 440, 380, 620), stream=make_figure_image())
    textbox(page, pymupdf.Rect(120, 624, 380, 640), "图 1-1 各方案性能对比", fontsize=9,
            fontfile=fontfile, align=1)
    # 页底脚注
    base_y = 720
    x_end = superscript(page, 70, base_y, "①", fontfile)
    textbox(page, pymupdf.Rect(x_end + 3, base_y - 8, 525, base_y + 8),
            "多模态指同时处理图像与文本的模型结构。", fontsize=8.2, fontfile=fontfile)
    x_end = superscript(page, 70, base_y + 18, "②", fontfile)
    textbox(page, pymupdf.Rect(x_end + 3, base_y + 10, 525, base_y + 26),
            "结构化数据包括 Markdown、HTML 及 EPUB 三类载体。", fontsize=8.2, fontfile=fontfile)


def page2_content(page, fontfile):
    """第二章:双栏正文 + 跨栏段落 + 上标[1]。"""
    draw_header_footer(page, "测试书籍 · 第二章 方法", "2", fontfile)
    textbox(page, pymupdf.Rect(70, 70, 525, 96), "第二章 方法", fontsize=17, fontfile=fontfile)
    left = pymupdf.Rect(70, 110, 292, 400)
    right = pymupdf.Rect(305, 110, 527, 400)
    textbox(page, left,
            "本章介绍混合解析框架的设计。第一步将页面渲染为高分辨率位图,并检测其中"
            "是否含有可提取的文本层;含有文本层的页面直接走无损提取路径,扫描页则进入"
            "版面分析与识别路径[1]。版面模型将页面划分为二十余种语义区块,包括正文、"
            "标题、表格、公式、图注与脚注等。", fontsize=9.8, fontfile=fontfile)
    textbox(page, right,
            "识别阶段针对不同区块类型调用相应任务:普通文本与标题走文字识别,表格走"
            "表格识别,公式走公式识别。随后按阅读顺序将各区块拼接为章节内容,并在"
            "页底脚注与正文引用标记之间建立配对。", fontsize=9.8, fontfile=fontfile)
    textbox(page, pymupdf.Rect(70, 410, 525, 470),
            "以上流程的关键在于脚注配对的鲁棒性:同页存在多个脚注时,需要按编号"
            "顺序与正文中的上标标记一一对应,任何错位都会破坏阅读体验。",
            fontsize=10.5, fontfile=fontfile)
    # 参考文献
    textbox(page, pymupdf.Rect(70, 500, 525, 520), "参考文献", fontsize=13, fontfile=fontfile)
    textbox(page, pymupdf.Rect(70, 524, 525, 560),
            "[1] 张三, 李四. 文档解析综述. 计算机学报, 2025.\n"
            "[2] Wang X. Document AI: A Survey. 2026.", fontsize=9.5, fontfile=fontfile)


def page3_content(page, fontfile):
    """将被扫描化的原始页:含脚注的正文。"""
    draw_header_footer(page, "测试书籍 · 第三章 结论", "3", fontfile)
    textbox(page, pymupdf.Rect(70, 70, 525, 100), "第三章 结论", fontsize=17, fontfile=fontfile)
    textbox(page, pymupdf.Rect(70, 110, 525, 300),
            "综合全文,混合架构在扫描书与文本书的场景下均能给出可接受的转换质量。"
            "脚注弹窗保留了原书的注释体系,页码锚点使读者可以对照纸质版③。"
            "未来工作将探索更细粒度的段落级排版还原,以及竖排与批注的支持④。",
            fontsize=10.5, fontfile=fontfile)
    textbox(page, pymupdf.Rect(70, 310, 525, 380),
            "本研究的主要贡献可以归纳为三点:完整的端到端管线、可校对的中间产物、"
            "以及面向阅读器的样式适配层。", fontsize=10.5, fontfile=fontfile)
    base_y = 700
    x_end = superscript(page, 70, base_y, "③", fontfile)
    textbox(page, pymupdf.Rect(x_end + 3, base_y - 8, 525, base_y + 8),
            "页码锚点以 epub:type=pagebreak 标记实现。", fontsize=8.2, fontfile=fontfile)
    x_end = superscript(page, 70, base_y + 18, "④", fontfile)
    textbox(page, pymupdf.Rect(x_end + 3, base_y + 10, 525, base_y + 26),
            "竖排支持依赖阅读器的 writing-mode 能力。", fontsize=8.2, fontfile=fontfile)


def build(out_pdf: Path):
    fontfile = pick_font()
    doc = pymupdf.open()
    page1_content(doc.new_page(width=595, height=842), fontfile)
    page2_content(doc.new_page(width=595, height=842), fontfile)
    # 第 3 页:生成后转成"扫描件"(整页位图,无文本层)
    p3 = doc.new_page(width=595, height=842)
    page3_content(p3, fontfile)
    pix = p3.get_pixmap(matrix=pymupdf.Matrix(200 / 72, 200 / 72), alpha=False)
    png = pix.tobytes("png")
    # 第 4 页:纯扫描附录页(只有一张大图,检测 image 区块)
    doc.set_toc([[1, "第一章 绪论", 1], [1, "第二章 方法", 2],
                 [1, "第三章 结论", 3], [1, "附录 原始样张", 4]])
    out_pdf.parent.mkdir(parents=True, exist_ok=True)
    # 重建:1,2 文本页;3 替换为位图页;4 位图附录
    doc.close()
    doc = pymupdf.open()
    page1_content(doc.new_page(width=595, height=842), fontfile)
    page2_content(doc.new_page(width=595, height=842), fontfile)
    p = doc.new_page(width=595, height=842)
    p.insert_image(p.rect, stream=png)
    p4 = doc.new_page(width=595, height=842)
    p4.insert_image(pymupdf.Rect(60, 60, 535, 700), stream=make_figure_image())
    textbox(p4, pymupdf.Rect(60, 710, 535, 730), "附录 A:原始样张(整页图)", fontsize=10,
            fontfile=fontfile, align=1)
    doc.set_toc([[1, "第一章 绪论", 1], [1, "第二章 方法", 2],
                 [1, "第三章 结论", 3], [1, "附录 原始样张", 4]])
    doc.save(out_pdf)
    doc.close()
    log.info("测试 PDF 已生成: %s", out_pdf)


if __name__ == "__main__":
    out = WORK_DIR / "test_book" / "test_book.pdf"
    build(out)
