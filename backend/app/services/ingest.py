import re
import ssl
from html import unescape
from html.parser import HTMLParser
from io import BytesIO
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse, unquote
from urllib.request import Request, urlopen
from xml.etree import ElementTree
from zipfile import BadZipFile, ZipFile

import certifi
import olefile
from pypdf import PdfReader


TEXT_EXTENSIONS = {
    ".txt",
    ".md",
    ".markdown",
    ".json",
    ".csv",
    ".py",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".css",
    ".yaml",
    ".yml",
}
HTML_EXTENSIONS = {".html", ".htm"}
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
WORD_EXTENSIONS = {".doc", ".docx"}


def normalize_document(filename: str, content: bytes) -> str:
    suffix = Path(filename).suffix.lower()

    if suffix in HTML_EXTENSIONS:
        return _extract_html_text(filename, content)

    if suffix in TEXT_EXTENSIONS:
        text = content.decode("utf-8", errors="ignore").strip()
        return text or f"[空文本文件] {filename}"

    if suffix == ".pdf":
        return _extract_pdf_text(filename, content)

    if suffix == ".docx":
        return _extract_docx_text(filename, content)

    if suffix == ".doc":
        return _extract_doc_text(filename, content)

    if suffix in IMAGE_EXTENSIONS:
        return (
            f"[图像资料] {filename}\n"
            "当前 MVP 仅记录图像作为资料来源。后续可接入 OCR 与视觉模型，"
            "把图中的文字、版式和风格信号继续蒸馏进用户分身。"
        )

    return (
        f"[未完全支持的文件类型] {filename}\n"
        "系统已保留原始文件，但当前版本仅做占位归档。"
    )


def classify_document_type(filename: str, normalized_text: str) -> str:
    basename = Path(filename).stem.lower()
    text = normalized_text.lower()

    if any(token in basename for token in ("prd", "产品需求", "需求文档")) or _contains_tokens(
        text, ("背景", "目标", "需求", "范围", "验收")
    ):
        return "prd"

    if any(token in basename for token in ("proposal", "方案", "solution")) or _contains_tokens(
        text, ("方案", "风险", "收益", "成本", "下一步")
    ):
        return "proposal"

    if any(token in basename for token in ("retro", "复盘", "review")) or _contains_tokens(
        text, ("复盘", "问题", "原因", "改进", "经验")
    ):
        return "retrospective"

    if any(token in basename for token in ("reply", "回复", "draft", "邮件")) or _contains_tokens(
        text, ("你好", "辛苦了", "感谢", "此致", "Best", "Regards")
    ):
        return "reply_draft"

    if any(token in basename for token in ("weekly", "周报", "weekly-report")) or _contains_tokens(
        text, ("本周", "下周", "进展", "风险", "阻塞")
    ):
        return "weekly_report"

    if any(token in basename for token in ("note", "笔记", "memo")) or _contains_tokens(
        text, ("想法", "记录", "备忘", "灵感")
    ):
        return "notes"

    return "generic"


def import_link_document(url: str) -> tuple[str, str, bytes, str]:
    parsed = urlparse(url.strip())
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("目前只支持导入 http / https 链接。")

    request = Request(
        url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
            )
        },
    )
    try:
        ssl_context = ssl.create_default_context(cafile=certifi.where())
        with urlopen(request, timeout=20, context=ssl_context) as response:
            content = response.read()
            final_url = response.geturl()
            media_type = response.headers.get_content_type() or "application/octet-stream"
    except Exception as exc:
        raise ValueError(f"链接抓取失败：{exc}") from exc

    if not content:
        raise ValueError("链接内容为空，无法导入。")

    filename = _guess_remote_filename(final_url, media_type, content)
    normalized = normalize_document(filename, content)
    return filename, media_type, content, normalized


def _contains_tokens(text: str, tokens: tuple[str, ...]) -> bool:
    return sum(1 for token in tokens if token.lower() in text) >= 2


def _extract_html_text(filename: str, content: bytes) -> str:
    raw = content.decode("utf-8", errors="ignore").strip()
    if not raw:
        return f"[空 HTML 文件] {filename}"

    parser = _HTMLTextExtractor()
    try:
        parser.feed(raw)
        parser.close()
    except Exception:
        text = _strip_html_fallback(raw)
        return text or f"[HTML 提取失败] {filename}"

    text = parser.get_text()
    return text or f"[HTML 无可提取正文] {filename}"


def _extract_pdf_text(filename: str, content: bytes) -> str:
    try:
        reader = PdfReader(BytesIO(content))
    except Exception:
        return f"[PDF 解析失败] {filename}"

    pages: list[str] = []
    for index, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        if text.strip():
            pages.append(f"[第 {index} 页]\n{text.strip()}")

    if not pages:
        return (
            f"[PDF 无可提取文本] {filename}\n"
            "可能是扫描件；后续可接入 OCR 提升覆盖率。"
        )
    return "\n\n".join(pages)


def _extract_docx_text(filename: str, content: bytes) -> str:
    try:
        with ZipFile(BytesIO(content)) as archive:
            names = [
                name
                for name in archive.namelist()
                if name == "word/document.xml"
                or (
                    name.startswith("word/")
                    and (name.endswith("header1.xml") or name.endswith("header2.xml") or name.endswith("footer1.xml"))
                )
            ]
            if "word/document.xml" not in names:
                names.insert(0, "word/document.xml")
            parts: list[str] = []
            for name in names:
                try:
                    xml_text = archive.read(name)
                except KeyError:
                    continue
                text = _extract_docx_xml_text(xml_text)
                if text:
                    parts.append(text)
    except BadZipFile:
        return f"[DOCX 解析失败] {filename}"
    except Exception:
        return f"[DOCX 解析失败] {filename}"

    if not parts:
        return f"[DOCX 无可提取正文] {filename}"
    return "\n\n".join(parts)


def _extract_docx_xml_text(content: bytes) -> str:
    try:
        root = ElementTree.fromstring(content)
    except ElementTree.ParseError:
        return ""

    namespace = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    paragraphs: list[str] = []
    for paragraph in root.findall(".//w:p", namespace):
        texts = [node.text or "" for node in paragraph.findall(".//w:t", namespace)]
        combined = "".join(texts).strip()
        if combined:
            paragraphs.append(combined)
    return "\n".join(paragraphs)


def _extract_doc_text(filename: str, content: bytes) -> str:
    try:
        ole = olefile.OleFileIO(BytesIO(content))
    except Exception:
        return f"[DOC 解析失败] {filename}"

    candidates: list[str] = []
    try:
        for stream in ole.listdir():
            try:
                payload = ole.openstream(stream).read()
            except Exception:
                continue
            candidates.extend(_extract_doc_candidates(payload))
    finally:
        ole.close()

    text = _dedupe_and_join_lines(candidates)
    if not text:
        return (
            f"[DOC 无可提取文本] {filename}\n"
            "当前对旧版 Word .doc 采用兼容解析；若内容不完整，建议另存为 .docx 后再上传。"
        )
    return text


class _HTMLTextExtractor(HTMLParser):
    BLOCK_TAGS = {
        "article",
        "aside",
        "blockquote",
        "br",
        "div",
        "dl",
        "fieldset",
        "figcaption",
        "figure",
        "footer",
        "form",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "header",
        "hr",
        "li",
        "main",
        "nav",
        "ol",
        "p",
        "pre",
        "section",
        "table",
        "tr",
        "ul",
    }
    CELL_TAGS = {"td", "th"}
    SKIP_TAGS = {"script", "style", "noscript", "svg"}

    def __init__(self) -> None:
        super().__init__()
        self._parts: list[str] = []
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, Optional[str]]]) -> None:
        if tag in self.SKIP_TAGS:
            self._skip_depth += 1
            return
        if self._skip_depth:
            return
        if tag in self.BLOCK_TAGS:
            self._parts.append("\n")
        elif tag in self.CELL_TAGS:
            self._parts.append(" | ")

    def handle_endtag(self, tag: str) -> None:
        if tag in self.SKIP_TAGS and self._skip_depth:
            self._skip_depth -= 1
            return
        if self._skip_depth:
            return
        if tag in self.BLOCK_TAGS:
            self._parts.append("\n")

    def handle_data(self, data: str) -> None:
        if self._skip_depth:
            return
        cleaned = " ".join(unescape(data).split())
        if cleaned:
            self._parts.append(cleaned)

    def get_text(self) -> str:
        joined = "".join(self._parts)
        lines: list[str] = []
        for line in joined.splitlines():
            cleaned = " ".join(line.split()).strip(" |")
            if cleaned:
                lines.append(cleaned)
        return "\n".join(lines)


def _strip_html_fallback(raw: str) -> str:
    text = unescape(raw)
    output: list[str] = []
    inside_tag = False
    for char in text:
        if char == "<":
            inside_tag = True
            output.append("\n")
            continue
        if char == ">":
            inside_tag = False
            output.append("\n")
            continue
        if not inside_tag:
            output.append(char)
    lines = [" ".join(line.split()) for line in "".join(output).splitlines()]
    return "\n".join(line for line in lines if line)


def _extract_doc_candidates(payload: bytes) -> list[str]:
    candidates: list[str] = []

    utf16_text = payload.decode("utf-16le", errors="ignore")
    candidates.extend(_extract_doc_lines(utf16_text))

    latin_text = payload.decode("latin1", errors="ignore")
    candidates.extend(re.findall(r"[A-Za-z0-9][A-Za-z0-9\s,.;:!?()/_\-]{12,}", latin_text))

    return candidates


def _extract_doc_lines(text: str) -> list[str]:
    lines: list[str] = []
    for raw in re.split(r"[\r\n\t\x00]+", text):
        cleaned = " ".join(raw.split()).strip()
        if len(cleaned) < 8:
            continue
        if _too_binary_like(cleaned):
            continue
        lines.append(cleaned)
    return lines


def _too_binary_like(text: str) -> bool:
    punctuation = sum(1 for char in text if not (char.isalnum() or "\u4e00" <= char <= "\u9fff" or char.isspace()))
    return punctuation > len(text) * 0.35


def _dedupe_and_join_lines(lines: list[str]) -> str:
    seen: set[str] = set()
    kept: list[str] = []
    for line in lines:
        normalized = line.strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        kept.append(normalized)
    return "\n".join(kept[:400])


def _guess_remote_filename(url: str, media_type: str, content: bytes) -> str:
    parsed = urlparse(url)
    path_name = Path(unquote(parsed.path)).name
    suffix = Path(path_name).suffix.lower()
    if suffix:
        return path_name

    if media_type == "application/pdf":
        return "imported-link.pdf"

    if "wordprocessingml.document" in media_type:
        return "imported-link.docx"

    if media_type == "application/msword":
        return "imported-link.doc"

    if media_type.startswith("text/html"):
        title = _extract_html_title(content)
        if title:
            safe = re.sub(r"[\\\\/:*?\"<>|]+", "_", title).strip()[:80]
            if safe:
                return f"{safe}.html"
        domain = parsed.netloc.replace(".", "_")
        return f"{domain or 'imported-link'}.html"

    if media_type.startswith("text/plain"):
        return "imported-link.txt"

    return path_name or "imported-link.bin"


def _extract_html_title(content: bytes) -> str:
    raw = content.decode("utf-8", errors="ignore")
    match = re.search(r"<title[^>]*>(.*?)</title>", raw, flags=re.IGNORECASE | re.DOTALL)
    if not match:
        return ""
    return " ".join(unescape(match.group(1)).split())
