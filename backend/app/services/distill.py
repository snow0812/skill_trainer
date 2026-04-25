import re
from collections import Counter
from typing import Optional
from uuid import uuid4


CLAIM_PATTERNS: list[tuple[str, tuple[str, ...]]] = [
    ("boundary", ("不要", "不能", "不会", "拒绝", "避免", "不接受")),
    ("principle", ("原则", "坚持", "必须", "应该", "长期", "价值", "相信")),
    ("preference", ("喜欢", "偏好", "热爱", "倾向", "讨厌")),
    ("decision_rule", ("如果", "优先", "通常", "会先", "判断", "选择", "取舍")),
    ("workflow", ("先", "然后", "最后", "复盘", "拆解", "推进", "交付", "规划")),
    ("artifact_pattern", ("模板", "结构", "输出", "文档", "方案", "清单")),
]
IDENTITY_PATTERNS: tuple[str, ...] = (
    r"^我是",
    r"^我负责",
    r"^我主要",
    r"^我在.+负责",
    r"^作为.+我",
    r"^我的工作是",
    r"^我的角色是",
)
NOISE_MARKERS: tuple[str, ...] = (
    "<!doctype",
    "<html",
    "<body",
    "<div",
    "<span",
    "<tr",
    "<td",
    "<th",
    "<table",
    "</",
    "user_prompt",
    "actual_tool_chain",
    "tool_calls",
    "expected_",
    "curl ",
    "http://",
    "https://",
    "class=",
    "style=",
    "function ",
    "const ",
    "let ",
    "var ",
)


def distill_user_operating_system(
    project_name: str, documents: list[dict[str, str]]
) -> tuple[list[dict], dict, dict]:
    sentences = _collect_sentences(documents)
    claims = _build_claims(sentences)
    structural_claims = _learn_structural_patterns(documents)
    claims = merge_claims(structural_claims, claims)
    profile = rebuild_profile_from_claims(project_name, documents, claims)
    stats = {
        "documents": len(documents),
        "sentences_seen": len(sentences),
        "claims": len(claims),
        "structural_claims": len(structural_claims),
        "profile_sections": len(
            [value for value in profile.values() if isinstance(value, list) and value]
        ),
    }
    return claims, profile, stats


def merge_claims(primary_claims: list[dict], secondary_claims: list[dict]) -> list[dict]:
    merged: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for claim in primary_claims + secondary_claims:
        key = (claim.get("type", ""), claim.get("statement", ""))
        if not key[1] or key in seen:
            continue
        seen.add(key)
        merged.append(claim)
    return merged


def merge_profiles(primary_profile: dict, secondary_profile: dict) -> dict:
    merged: dict = {}
    keys = {
        "identity",
        "principles",
        "decision_rules",
        "workflows",
        "voice",
        "boundaries",
        "output_patterns",
        "uncertainty_policy",
    }
    for key in keys:
        primary_items = primary_profile.get(key, []) if isinstance(primary_profile, dict) else []
        secondary_items = secondary_profile.get(key, []) if isinstance(secondary_profile, dict) else []
        merged[key] = _dedupe(list(primary_items) + list(secondary_items))
    return merged


def _collect_sentences(documents: list[dict[str, str]]) -> list[dict[str, str]]:
    collected: list[dict[str, str]] = []
    for document in documents:
        raw_parts = re.split(r"[\n。！？!?]+", document["text"])
        for part in raw_parts:
            sentence = re.sub(r"\s+", " ", part).strip(" -\t")
            if len(sentence) < 8 or _is_noise_text(sentence):
                continue
            collected.append(
                {
                    "document_id": document["id"],
                    "filename": document["filename"],
                    "text": sentence[:320],
                }
            )
    return collected


def _build_claims(sentences: list[dict[str, str]]) -> list[dict]:
    claims: list[dict] = []
    for sentence in sentences:
        claim_type = _classify_sentence(sentence["text"])
        if claim_type is None:
            continue
        confidence = _score_claim(sentence["text"], claim_type)
        claims.append(
            {
                "id": uuid4().hex,
                "type": claim_type,
                "statement": sentence["text"],
                "confidence": confidence,
                "status": "EXTRACTED",
                "evidence_text": sentence["text"],
                "source_document_id": sentence["document_id"],
                "review_status": "pending",
                "selected": True,
                "notes": "",
            }
        )

    fallback_identity_sentences = [
        sentence for sentence in sentences if _looks_like_identity_statement(sentence["text"])
    ]
    if not claims and fallback_identity_sentences:
        for sentence in fallback_identity_sentences[:6]:
            claims.append(
                {
                    "id": uuid4().hex,
                    "type": "identity",
                    "statement": sentence["text"],
                    "confidence": 0.51,
                    "status": "AMBIGUOUS",
                    "evidence_text": sentence["text"],
                    "source_document_id": sentence["document_id"],
                    "review_status": "pending",
                    "selected": True,
                    "notes": "",
                }
            )
    return claims


def _learn_structural_patterns(documents: list[dict[str, str]]) -> list[dict]:
    claims: list[dict] = []
    repeated_heading_patterns: Counter[str] = Counter()
    type_counter: Counter[str] = Counter(document.get("document_type", "generic") for document in documents)

    for document in documents:
        text = document["text"]
        document_type = document.get("document_type", "generic")
        headings = _extract_headings(text)
        numbered_steps = _extract_ordered_steps(text)
        bullet_count = _count_bullets(text)

        if len(headings) >= 3:
            compact_headings = headings[:5]
            sequence = " -> ".join(compact_headings)
            claims.append(
                _make_structural_claim(
                    claim_type="artifact_pattern",
                    statement=f"{_document_type_label(document_type)}常按“{sequence}”这样的章节顺序组织内容。",
                    evidence_text=" / ".join(compact_headings),
                    source_document_id=document["id"],
                    confidence=0.79,
                )
            )
            repeated_heading_patterns[" -> ".join(_normalize_heading(item) for item in compact_headings)] += 1

        if len(numbered_steps) >= 3:
            step_preview = " -> ".join(numbered_steps[:4])
            claims.append(
                _make_structural_claim(
                    claim_type="workflow",
                    statement=f"在{_document_type_label(document_type)}里，处理任务时倾向先拆成明确步骤，再按顺序推进和交付。",
                    evidence_text=step_preview,
                    source_document_id=document["id"],
                    confidence=0.81,
                )
            )

        if bullet_count >= 4:
            claims.append(
                _make_structural_claim(
                    claim_type="artifact_pattern",
                    statement=f"{_document_type_label(document_type)}里经常使用列表化清单来压缩信息并提高可执行性。",
                    evidence_text=f"检测到 {bullet_count} 个列表项",
                    source_document_id=document["id"],
                    confidence=0.7,
                )
            )

        template_signal = _infer_template_signal(text)
        if template_signal:
            claims.append(
                _make_structural_claim(
                    claim_type="artifact_pattern",
                    statement=f"{_document_type_label(document_type)}通常{template_signal['statement']}",
                    evidence_text=template_signal["evidence_text"],
                    source_document_id=document["id"],
                    confidence=template_signal["confidence"],
                )
            )

    for pattern, count in repeated_heading_patterns.items():
        if count >= 2:
            claims.append(
                _make_structural_claim(
                    claim_type="artifact_pattern",
                    statement=f"多份资料重复使用“{pattern}”这一输出骨架，说明这是稳定的文档模板。",
                    evidence_text=f"重复出现 {count} 次",
                    source_document_id="",
                    confidence=0.84,
                )
            )

    for document_type, count in type_counter.items():
        if count >= 2 and document_type != "generic":
            claims.append(
                _make_structural_claim(
                    claim_type="workflow",
                    statement=f"资料中有 {count} 份{_document_type_label(document_type)}，说明这种场景是高频工作流，应优先学习其写法和推进方式。",
                    evidence_text=f"{document_type} x {count}",
                    source_document_id="",
                    confidence=0.72,
                )
            )
    return claims


def _classify_sentence(text: str) -> Optional[str]:
    if _is_noise_text(text):
        return None
    for claim_type, keywords in CLAIM_PATTERNS:
        if any(keyword in text for keyword in keywords):
            return claim_type
    if _looks_like_identity_statement(text):
        return "identity"
    return None


def _score_claim(text: str, claim_type: str) -> float:
    base = {
        "identity": 0.58,
        "principle": 0.78,
        "preference": 0.72,
        "decision_rule": 0.74,
        "workflow": 0.76,
        "voice_pattern": 0.65,
        "boundary": 0.82,
        "artifact_pattern": 0.7,
    }.get(claim_type, 0.6)
    if claim_type == "identity" and _looks_like_identity_statement(text):
        base += 0.04
    if len(text) > 48:
        base += 0.03
    return round(min(base, 0.95), 2)


def rebuild_profile_from_claims(
    project_name: str, documents: list[dict[str, str]], claims: list[dict]
) -> dict:
    selected_claims = [claim for claim in claims if claim.get("selected", True)]
    if not selected_claims:
        selected_claims = claims
    return _build_profile(project_name, documents, selected_claims)


def _build_profile(project_name: str, documents: list[dict[str, str]], claims: list[dict]) -> dict:
    counter = Counter(claim["type"] for claim in claims)
    identity = _dedupe(
        [claim["statement"] for claim in claims if claim["type"] == "identity"][:4]
    )
    principles = _dedupe(
        [claim["statement"] for claim in claims if claim["type"] == "principle"][:6]
    )
    decision_rules = _dedupe(
        [claim["statement"] for claim in claims if claim["type"] == "decision_rule"][:6]
    )
    workflows = _dedupe(
        [claim["statement"] for claim in claims if claim["type"] == "workflow"][:6]
    )
    boundaries = _dedupe(
        [claim["statement"] for claim in claims if claim["type"] == "boundary"][:6]
    )
    output_patterns = _dedupe(
        [
            claim["statement"]
            for claim in claims
            if claim["type"] == "artifact_pattern"
        ][:6]
    )
    voice = _infer_voice(documents, counter)

    if not identity:
        identity = [f"{project_name} 的资料尚未形成稳定自我描述，需补充更多一手表达材料。"]
    if not principles:
        principles = ["当前资料里缺少足够明确的原则表达，建议补充长文、访谈或决策复盘。"]
    if not decision_rules:
        decision_rules = ["优先按证据做判断，资料不足时先澄清问题再输出结论。"]
    if not workflows:
        workflows = ["先界定目标，再拆解任务，最后交付最小可行版本。"]
    if not boundaries:
        boundaries = ["证据不足时不得替用户做确定性承诺。"]
    if not output_patterns:
        output_patterns = ["输出时优先给结论，再补充依据、风险和下一步建议。"]

    return {
        "identity": identity,
        "principles": principles,
        "decision_rules": decision_rules,
        "workflows": workflows,
        "voice": voice,
        "boundaries": boundaries,
        "output_patterns": output_patterns,
        "uncertainty_policy": [
            "如果证据冲突或不足，明确说明这是推断而不是确认事实。",
            "高风险场景优先保守表达，不替用户做价值承诺和资源承诺。",
        ],
    }


def _infer_voice(documents: list[dict[str, str]], counter: Counter[str]) -> list[str]:
    corpus = "\n".join(document["text"] for document in documents)
    sentences = [item for item in re.split(r"[。！？!?]+", corpus) if item.strip()]
    avg_length = int(sum(len(item.strip()) for item in sentences) / max(len(sentences), 1))
    numbered = corpus.count("1.") + corpus.count("2.") + corpus.count("3.")
    dash_bullets = corpus.count("- ") + corpus.count("•")
    markers = []

    if avg_length <= 28:
        markers.append("表达相对简洁，偏向短句和直接判断。")
    else:
        markers.append("表达会保留一定展开，倾向先给判断再做拆解。")

    if numbered > 0 or dash_bullets > 2:
        markers.append("结构化意识较强，常用列表、步骤或分段推进表达。")

    if counter["boundary"] >= 2:
        markers.append("表达里有明显边界感，遇到不确定内容会倾向保守。")

    markers.append("在代写和代答时，应优先复用用户的判断顺序，而不只是模仿措辞。")
    return _dedupe(markers)[:5]


def _extract_headings(text: str) -> list[str]:
    headings: list[str] = []
    previous_blank = True
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            previous_blank = True
            continue
        if line.startswith("#"):
            heading = line.lstrip("#").strip()
            if 2 <= len(heading) <= 30 and not _is_noise_text(heading):
                headings.append(heading)
                previous_blank = False
                continue
        if (
            len(line) <= 20
            and not _is_noise_text(line)
            and line[-1:] not in {"。", ".", "!", "！", "?", "？"}
            and not re.match(r"^[-*•\d]", line)
            and (
                previous_blank
                or any(
                    token in line
                    for token in (
                        "目标",
                        "背景",
                        "方案",
                        "风险",
                        "结论",
                        "下一步",
                        "计划",
                        "复盘",
                        "问题",
                        "原因",
                        "改进",
                        "经验",
                        "需求",
                        "范围",
                        "验收",
                    )
                )
            )
        ):
            headings.append(line.strip("：:"))
        previous_blank = False
    return _dedupe(headings)


def _extract_ordered_steps(text: str) -> list[str]:
    steps: list[str] = []
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if re.match(r"^\d+[.\)、]\s*", line):
            cleaned = re.sub(r"^\d+[.\)、]\s*", "", line)[:120]
            if not _is_noise_text(cleaned):
                steps.append(cleaned[:36])
    return steps


def _count_bullets(text: str) -> int:
    return len(
        [
            line
            for line in text.splitlines()
            if re.match(r"^\s*[-*•]\s+", line.strip()) and not _is_noise_text(line.strip())
        ]
    )


def _infer_template_signal(text: str) -> Optional[dict]:
    if _is_noise_text(text):
        return None
    lowered = text.lower()
    if all(token in lowered for token in ("summary", "risk", "next")):
        return {
            "statement": "按 summary -> risk -> next steps 的执行模板组织。",
            "evidence_text": "summary / risk / next",
            "confidence": 0.76,
        }

    tokens = ["背景", "目标", "方案", "风险", "下一步"]
    hit_tokens = [token for token in tokens if token in text]
    if len(hit_tokens) >= 3:
        return {
            "statement": f"覆盖“{' -> '.join(hit_tokens)}”这些核心模块，说明写作偏向完整决策包。",
            "evidence_text": " / ".join(hit_tokens),
            "confidence": 0.8,
        }

    if all(token in text for token in ("问题", "分析", "建议")):
        return {
            "statement": "先定义问题，再分析，再给建议。",
            "evidence_text": "问题 / 分析 / 建议",
            "confidence": 0.75,
        }
    return None


def _normalize_heading(value: str) -> str:
    return re.sub(r"\s+", "", value.lower())


def _looks_like_identity_statement(text: str) -> bool:
    cleaned = text.strip()
    if _is_noise_text(cleaned):
        return False
    return any(re.search(pattern, cleaned) for pattern in IDENTITY_PATTERNS)


def _is_noise_text(text: str) -> bool:
    lowered = text.lower().strip()
    if not lowered:
        return True
    if any(marker in lowered for marker in NOISE_MARKERS):
        return True
    if re.search(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", text):
        return True
    if re.search(r"<[^>]+>", text):
        return True
    if text.count("|") >= 3:
        return True
    if text.count("{") + text.count("}") >= 2:
        return True
    if re.search(r"^[\[\]{}()<>:/\\|`~^*=#&;,_\-.0-9\s]+$", text):
        return True
    return False


def _make_structural_claim(
    claim_type: str,
    statement: str,
    evidence_text: str,
    source_document_id: str,
    confidence: float,
) -> dict:
    return {
        "id": uuid4().hex,
        "type": claim_type,
        "statement": statement,
        "confidence": confidence,
        "status": "INFERRED",
        "evidence_text": evidence_text,
        "source_document_id": source_document_id,
        "review_status": "pending",
        "selected": True,
        "notes": "learned_from_document_structure",
    }


def _document_type_label(document_type: str) -> str:
    mapping = {
        "prd": "PRD",
        "proposal": "方案文档",
        "retrospective": "复盘文档",
        "reply_draft": "回复草稿",
        "weekly_report": "周报",
        "notes": "笔记",
        "generic": "通用文档",
    }
    return mapping.get(document_type, document_type)


def _dedupe(items: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        cleaned = item.strip()
        if not cleaned or cleaned in seen:
            continue
        seen.add(cleaned)
        result.append(cleaned)
    return result
