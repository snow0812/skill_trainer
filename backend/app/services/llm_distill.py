import json
import re
import ssl
from datetime import datetime, timezone
from typing import Any, Optional
from urllib import error, request

import certifi

from ..config import LLM_API_KEY, LLM_BASE_URL, LLM_MODEL, llm_is_configured
from ..schemas import CLAIM_TYPE_VALUES


SYSTEM_PROMPT = """你在做一个“用户个人操作系统”蒸馏器。

目标不是总结资料，而是从资料中提炼：
- identity
- principles
- decision_rules
- workflows
- voice
- boundaries
- output_patterns
- uncertainty_policy

要求：
1. 只能基于给定材料输出，不要臆测外部信息。
2. 每条 claim 都必须包含原文 evidence_text。
3. 证据不足时，宁可少写，也不要编造。
4. 返回严格 JSON，不要包 markdown 代码块。
5. 目标是提炼“这个人如何表达、判断、工作、设边界”，不是复述系统规则、工具 schema、接口参数、HTML 结构、页面模板、测试样例或数据字段。
6. 不要把 `user_prompt`、`tool_calls`、`expected_*`、HTML 标签、CSS、表格骨架、代码片段直接写进 profile 或 claim statement。
7. 如果材料主要是系统/工具文档，只能提炼其中能稳定反映“用户工作方式或判断方式”的高层规律，且必须用自然语言重写，不能保留原始技术碎片。
"""

DOCUMENT_PREP_SYSTEM_PROMPT = """你在做用户分身蒸馏前的“文档信号提纯”。

你的任务不是直接生成 profile，而是先判断每份资料里哪些原文片段真正能反映作者/项目主导者的稳定工作方式。

请严格区分两类内容：
1. 可用于蒸馏的高信号内容：
- 作者本人或团队稳定的判断标准、取舍原则、工作流、边界、表达习惯、产出偏好
- 明确写出来的方法论、流程设计意图、评估框架、产品原则
2. 不可直接用于蒸馏的噪音内容：
- HTML / CSS / 表格骨架 / 标签
- tool schema / API 参数 / JSON 字段 / 占位符
- 示例 query / 测试 case / Judge Prompt / 输出格式说明
- 纯样例数据、链接、字段名、模板标记

要求：
1. 每条 high_signal_evidence.text 必须是原文直接摘录，不能改写。
2. 只有当某段原文能稳定反映“这个人如何判断、工作、设边界、表达”时，才能收录。
3. 如果某文档主要是 schema、样例、query 表、测试集，就只保留极少数真正体现方法论的原文；如果没有，就返回空数组。
4. 不要把项目名、文件名、页面结构、示例 query 当成 identity 证据。
5. 返回严格 JSON，不要包 markdown 代码块。
"""

PREVIEW_SYSTEM_PROMPT = """你在做一个“用户分身试运行”。

目标不是总结规则，而是基于已有 profile 和 claims，针对一个真实任务给出一版“像用户本人”的处理结果。

要求：
1. 优先遵循用户的 principles、decision_rules、workflows、boundaries、voice。
2. 回答要像用户在工作中真的会给出的内容，而不是解释规则本身。
3. 如果资料不足或边界不清，请在 warnings 里明确指出。
4. 返回严格 JSON，不要包 markdown 代码块。
"""

PREVIEW_FEEDBACK_SYSTEM_PROMPT = """你在做一个“用户分身训练建议器”。

你会看到：
1. 用户任务
2. 分身本次输出
3. 用户反馈标签
4. 当前 profile

你的目标是提出少量、高价值、可直接用于训练的修改建议。

要求：
1. 只输出能提升“像用户本人”的建议，不要泛泛而谈。
2. 每条建议必须落到具体 section：principles / decision_rules / workflows / voice / boundaries。
3. 每条建议都要给出一条可直接加入训练草稿的 suggested_text。
4. 优先结合已有 claims 判断应该修正哪条旧结论；如果建议是在补充新规则，再留空 target_claim_ids。
5. 如果用户提供了补充说明，优先以补充说明作为这次训练的直接监督信号。
6. 返回严格 JSON，不要包 markdown 代码块。
"""

PREVIEW_COMPARE_SYSTEM_PROMPT = """你在做一个“用户分身 patch A/B 评测器”。

你会看到同一个真实任务下的两版输出：
1. baseline：当前已生效规则产出的输出
2. candidate：加入候选 patch 后的输出

你的目标是判断哪一版更像用户本人，并给出简洁理由。

要求：
1. 重点看判断逻辑、工作顺序、边界感和表达是否更像用户，而不是字数长短。
2. 如果两版各有优劣且差异不明显，可以返回 tie。
3. baseline_score / candidate_score 用 1-5 分，5 代表更像用户。
4. 返回严格 JSON，不要包 markdown 代码块。
"""

BENCHMARK_TASKS_SYSTEM_PROMPT = """你在做一个“用户分身自动实验任务设计器”。

你的目标是基于用户资料中已经提纯出的高信号内容，以及当前 profile / claims，
生成一组最能检验“这个分身是否真的像用户本人”的代表性真实任务。

要求：
1. 任务必须贴近用户真实工作，而不是通用空泛写作题。
2. 优先覆盖：回复、判断、方案整理、任务推进、边界处理等高频场景。
3. 任务描述要具体、自然，像用户真的会拿来验证分身的事情。
4. 最多输出 6 条任务，避免重复。
5. 每条任务都要包含 title、scenario、prompt、source_hint。
6. 返回严格 JSON，不要包 markdown 代码块。
"""

LLM_NOISE_MARKERS = (
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
    "schema",
    "class=",
    "style=",
    "http://",
    "https://",
    "{user_query}",
    "{tool_calls_json}",
    "{params_json}",
    "{image_url}",
    "{video_url}",
    "{output_video_url}",
    "query 文本",
    "参考资料",
    "pass：",
    "fail（任一）",
    "输出格式",
    "case_id",
    "tool_input",
)


def llm_distill_user_operating_system(
    project_name: str,
    documents: list[dict[str, str]],
) -> tuple[list[dict[str, Any]], dict[str, Any], dict[str, Any]]:
    if not llm_is_configured():
        return [], {}, _meta(False, "LLM not configured")

    try:
        prepared_documents = _prepare_documents_for_distillation(documents)
        if not prepared_documents:
            return [], {}, _meta(False, "LLM preparation produced no high-signal evidence")

        payload = _build_messages(prepared_documents)
        raw = _call_openai_compatible_api(payload)
        parsed = _parse_response(raw)
        claims = parsed.get("claims", [])
        profile = parsed.get("profile", {})
        if not isinstance(claims, list) or not isinstance(profile, dict):
            return [], {}, _meta(False, "LLM payload missing claims/profile object")
        normalized_claims, invalid_examples = _normalize_claims(
            [item for item in claims if isinstance(item, dict)],
            documents,
        )
        normalized_profile = _normalize_profile(profile)
        if not normalized_claims:
            return [], {}, _meta(
                False,
                "LLM payload produced no evidence-backed claims after validation",
                invalid_claims_dropped=len(invalid_examples),
                invalid_claim_examples=invalid_examples[:5],
            )
        if not _has_profile_content(normalized_profile):
            return [], {}, _meta(
                False,
                "LLM payload produced empty profile after normalization",
                invalid_claims_dropped=len(invalid_examples),
                invalid_claim_examples=invalid_examples[:5],
            )
        return normalized_claims, normalized_profile, _meta(
            True,
            None,
            invalid_claims_dropped=len(invalid_examples),
            invalid_claim_examples=invalid_examples[:5],
        )
    except Exception as exc:
        return [], {}, _meta(False, _compact_error(exc))


def llm_preview_user_twin(
    project_name: str,
    scenario: str,
    prompt: str,
    profile: dict[str, Any],
    claims: list[dict[str, Any]],
) -> tuple[dict[str, Any], dict[str, Any]]:
    if not llm_is_configured():
        return {}, _meta(False, "LLM not configured")

    payload = _build_preview_messages(project_name, scenario, prompt, profile, claims)
    try:
        raw = _call_openai_compatible_api(payload)
        parsed = _parse_response(raw)
        normalized_preview = _normalize_preview(parsed)
        if not normalized_preview.get("response"):
            return {}, _meta(False, "LLM preview payload missing response")
        return normalized_preview, _meta(True, None)
    except Exception as exc:
        return {}, _meta(False, _compact_error(exc))


def llm_generate_preview_feedback(
    scenario: str,
    prompt: str,
    response: str,
    feedback: str,
    feedback_note: str,
    profile: dict[str, Any],
    claims: list[dict[str, Any]],
) -> tuple[dict[str, Any], dict[str, Any]]:
    if not llm_is_configured():
        return {}, _meta(False, "LLM not configured")

    payload = _build_preview_feedback_messages(
        scenario=scenario,
        prompt=prompt,
        response=response,
        feedback=feedback,
        feedback_note=feedback_note,
        profile=profile,
        claims=claims,
    )
    try:
        raw = _call_openai_compatible_api(payload)
        parsed = _parse_response(raw)
        normalized = _normalize_preview_feedback(
            parsed,
            known_claim_ids={
                str(claim.get("id", "")).strip() for claim in claims if str(claim.get("id", "")).strip()
            },
        )
        if not normalized.get("suggestions"):
            return {}, _meta(False, "LLM feedback payload missing suggestions")
        return normalized, _meta(True, None)
    except Exception as exc:
        return {}, _meta(False, _compact_error(exc))


def llm_compare_preview_pair(
    scenario: str,
    prompt: str,
    baseline_response: str,
    candidate_response: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    if not llm_is_configured():
        return {}, _meta(False, "LLM not configured")

    payload = _build_preview_compare_messages(
        scenario=scenario,
        prompt=prompt,
        baseline_response=baseline_response,
        candidate_response=candidate_response,
    )
    try:
        raw = _call_openai_compatible_api(payload)
        parsed = _parse_response(raw)
        normalized = _normalize_preview_compare(parsed)
        if not normalized.get("winner"):
            return {}, _meta(False, "LLM compare payload missing winner")
        return normalized, _meta(True, None)
    except Exception as exc:
        return {}, _meta(False, _compact_error(exc))


def llm_generate_benchmark_tasks(
    project_name: str,
    documents: list[dict[str, str]],
    profile: dict[str, Any],
    claims: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    if not llm_is_configured():
        return _fallback_benchmark_tasks(documents, profile, claims), _meta(False, "LLM not configured")

    try:
        prepared_documents = _prepare_documents_for_distillation(documents)
        if not prepared_documents:
            return _fallback_benchmark_tasks(documents, profile, claims), _meta(
                False, "LLM preparation produced no high-signal evidence"
            )
        payload = _build_benchmark_task_messages(project_name, prepared_documents, profile, claims)
        raw = _call_openai_compatible_api(payload)
        parsed = _parse_response(raw)
        normalized_tasks = _normalize_benchmark_tasks(parsed)
        if not normalized_tasks:
            return _fallback_benchmark_tasks(documents, profile, claims), _meta(
                False, "LLM benchmark task payload missing tasks"
            )
        return normalized_tasks, _meta(True, None)
    except Exception as exc:
        return _fallback_benchmark_tasks(documents, profile, claims), _meta(False, _compact_error(exc))


def _build_messages(prepared_documents: list[dict[str, Any]]) -> dict[str, Any]:
    snippets: list[str] = []
    for document in prepared_documents[:12]:
        snippets.append(
            "\n".join(
                [
                    f"[document_id] {document['id']}",
                    f"[filename] {document['filename']}",
                    f"[document_role] {document['document_role']}",
                    "[high_signal_evidence]",
                    json.dumps(document["evidence_candidates"], ensure_ascii=False, indent=2),
                ]
            )
        )

    user_prompt = f"""
请只基于下列“高信号证据”输出 JSON：
{{
  "claims": [
    {{
      "type": "identity|principle|preference|decision_rule|workflow|voice_pattern|boundary|artifact_pattern",
      "statement": "提炼后的判断",
      "confidence": 0.0,
      "status": "EXTRACTED|INFERRED|AMBIGUOUS",
      "evidence_text": "直接摘录的原文证据",
      "source_document_id": "来源文档 id"
    }}
  ],
  "profile": {{
    "identity": ["..."],
    "principles": ["..."],
    "decision_rules": ["..."],
    "workflows": ["..."],
    "voice": ["..."],
    "boundaries": ["..."],
    "output_patterns": ["..."],
    "uncertainty_policy": ["..."]
  }}
}}

高信号证据如下：

{chr(10).join(snippets)}

再次强调：
- 上面已经是第一阶段提纯后的候选证据，你只能基于这些 evidence 推断，不要脑补原始全文里可能存在的其他内容。
- claims 的 evidence_text 必须逐字等于某条 high_signal_evidence.text。
- 不要把项目名、文件名、schema、样例 query、输出格式、HTML 结构当成 identity / principle / workflow。
- profile 各 section 必须是自然语言总结，不要输出代码、标签、字段名、占位符。
"""

    return {
        "model": LLM_MODEL,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
    }


def _prepare_documents_for_distillation(documents: list[dict[str, str]]) -> list[dict[str, Any]]:
    payload = _build_document_preparation_messages(documents)
    raw = _call_openai_compatible_api(payload)
    parsed = _parse_response(raw)
    return _normalize_prepared_documents(parsed, documents)


def _build_document_preparation_messages(documents: list[dict[str, str]]) -> dict[str, Any]:
    snippets: list[str] = []
    for document in documents[:12]:
        snippets.append(
            "\n".join(
                [
                    f"[document_id] {document['id']}",
                    f"[filename] {document['filename']}",
                    f"[document_type] {document.get('document_type', 'generic')}",
                    "[content]",
                    document["text"][:4000],
                ]
            )
        )

    user_prompt = f"""
请逐份分析以下资料，输出 JSON：
{{
  "documents": [
    {{
      "document_id": "原文 document_id",
      "document_role": "authoring_doc|reference_spec|evaluation_spec|example_set|mixed",
      "high_signal_evidence": [
        {{
          "claim_type_hint": "identity|principle|decision_rule|workflow|voice_pattern|boundary|artifact_pattern|uncertainty_policy",
          "text": "原文直接摘录",
          "reason": "为什么这段能反映作者稳定工作方式"
        }}
      ]
    }}
  ]
}}

资料如下：
{chr(10).join(snippets)}
"""
    return {
        "model": LLM_MODEL,
        "temperature": 0.1,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": DOCUMENT_PREP_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
    }


def _normalize_prepared_documents(
    payload: dict[str, Any],
    source_documents: list[dict[str, str]],
) -> list[dict[str, Any]]:
    raw_documents = payload.get("documents", [])
    if not isinstance(raw_documents, list):
        return []

    source_map = {
        str(document.get("id", "")).strip(): document
        for document in source_documents
        if str(document.get("id", "")).strip()
    }
    prepared: list[dict[str, Any]] = []
    for item in raw_documents:
        if not isinstance(item, dict):
            continue
        document_id = str(item.get("document_id", "")).strip()
        if document_id not in source_map:
            continue
        evidence_candidates = _normalize_evidence_candidates(
            item.get("high_signal_evidence", []),
            source_map[document_id]["text"],
        )
        if not evidence_candidates:
            continue
        prepared.append(
            {
                "id": document_id,
                "filename": source_map[document_id]["filename"],
                "document_role": str(item.get("document_role", "")).strip() or "mixed",
                "evidence_candidates": evidence_candidates,
            }
        )
    return prepared


def _normalize_evidence_candidates(raw_candidates: Any, document_text: str) -> list[dict[str, str]]:
    if not isinstance(raw_candidates, list):
        return []
    normalized_document = _normalize_search_text(document_text)
    candidates: list[dict[str, str]] = []
    seen: set[str] = set()
    for candidate in raw_candidates[:12]:
        if not isinstance(candidate, dict):
            continue
        text = str(candidate.get("text", "")).strip()
        claim_type_hint = str(candidate.get("claim_type_hint", "")).strip()
        reason = str(candidate.get("reason", "")).strip()
        normalized_text = _normalize_search_text(text)
        if (
            not text
            or normalized_text in seen
            or len(normalized_text) < 8
            or normalized_text not in normalized_document
            or _is_noise_text(text)
        ):
            continue
        seen.add(normalized_text)
        candidates.append(
            {
                "claim_type_hint": claim_type_hint or "principle",
                "text": text,
                "reason": reason or "该片段稳定反映作者工作方式。",
            }
        )
    return candidates


def _build_preview_messages(
    project_name: str,
    scenario: str,
    prompt: str,
    profile: dict[str, Any],
    claims: list[dict[str, Any]],
) -> dict[str, Any]:
    selected_claims = [
        {
            "type": claim.get("type"),
            "statement": claim.get("statement"),
            "evidence_text": claim.get("evidence_text"),
        }
        for claim in claims[:12]
    ]

    user_prompt = f"""
项目名：{project_name}
试运行场景：{scenario}
用户任务：
{prompt}

当前 profile：
{json.dumps(profile, ensure_ascii=False, indent=2)}

高相关 claims：
{json.dumps(selected_claims, ensure_ascii=False, indent=2)}

请输出 JSON：
{{
  "response": "按用户本人风格给出的最终回答或处理方案",
  "reason_trace": {{
    "principles": ["支撑这次回答的原则"],
    "workflows": ["支撑这次回答的工作流"],
    "boundaries": ["这次回答遵循的边界"],
    "voice": ["这次回答使用的表达风格"]
  }},
  "warnings": ["资料不足或需要人工复核的点"]
}}
"""

    return {
        "model": LLM_MODEL,
        "temperature": 0.4,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": PREVIEW_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
    }


def _build_preview_feedback_messages(
    scenario: str,
    prompt: str,
    response: str,
    feedback: str,
    feedback_note: str,
    profile: dict[str, Any],
    claims: list[dict[str, Any]],
) -> dict[str, Any]:
    selected_claims = [
        {
            "id": str(claim.get("id", "")).strip(),
            "type": claim.get("type"),
            "statement": claim.get("statement"),
            "evidence_text": claim.get("evidence_text"),
        }
        for claim in claims[:12]
    ]
    user_prompt = f"""
试运行场景：{scenario}
用户任务：
{prompt}

分身输出：
{response}

用户反馈：
{feedback}

用户补充说明：
{feedback_note.strip() or "无"}

当前 profile：
{json.dumps(profile, ensure_ascii=False, indent=2)}

当前候选 claims：
{json.dumps(selected_claims, ensure_ascii=False, indent=2)}

请输出 JSON：
{{
  "summary": "一句话总结本次应该怎么训练",
  "suggestions": [
    {{
      "section": "principles|decision_rules|workflows|voice|boundaries",
      "title": "建议标题",
      "suggested_text": "可直接加入训练草稿的内容",
      "reason": "为什么这条建议能修正本次问题",
      "target_claim_ids": ["应该被修正、替换、弱化或补充的 claim id；如果没有则留空"]
    }}
  ]
}}
"""
    return {
        "model": LLM_MODEL,
        "temperature": 0.3,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": PREVIEW_FEEDBACK_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
    }


def _build_preview_compare_messages(
    scenario: str,
    prompt: str,
    baseline_response: str,
    candidate_response: str,
) -> dict[str, Any]:
    user_prompt = f"""
试运行场景：{scenario}
用户任务：
{prompt}

baseline 输出：
{baseline_response}

candidate 输出：
{candidate_response}

请输出 JSON：
{{
  "winner": "baseline|candidate|tie",
  "rationale": "1-3 句解释为什么",
  "baseline_score": 1,
  "candidate_score": 1
}}
"""
    return {
        "model": LLM_MODEL,
        "temperature": 0.1,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": PREVIEW_COMPARE_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
    }


def _build_benchmark_task_messages(
    project_name: str,
    prepared_documents: list[dict[str, Any]],
    profile: dict[str, Any],
    claims: list[dict[str, Any]],
) -> dict[str, Any]:
    evidence_payload = [
        {
            "document_id": document["id"],
            "filename": document["filename"],
            "document_role": document["document_role"],
            "high_signal_evidence": document["evidence_candidates"][:4],
        }
        for document in prepared_documents[:8]
    ]
    selected_claims = [
        {
            "type": claim.get("type"),
            "statement": claim.get("statement"),
        }
        for claim in claims[:12]
    ]
    user_prompt = f"""
项目名：{project_name}

当前 profile：
{json.dumps(profile, ensure_ascii=False, indent=2)}

当前高相关 claims：
{json.dumps(selected_claims, ensure_ascii=False, indent=2)}

高信号资料：
{json.dumps(evidence_payload, ensure_ascii=False, indent=2)}

请输出 JSON：
{{
  "tasks": [
    {{
      "title": "任务标题",
      "scenario": "写回复|做判断|写方案|拆任务|控边界|复盘",
      "prompt": "具体用户任务",
      "source_hint": "这条任务主要在检验哪类工作方式"
    }}
  ]
}}
"""
    return {
        "model": LLM_MODEL,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": BENCHMARK_TASKS_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
    }


def _call_openai_compatible_api(payload: dict[str, Any]) -> str:
    endpoint = f"{LLM_BASE_URL.rstrip('/')}/chat/completions"
    req = request.Request(
        endpoint,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {LLM_API_KEY}",
        },
        method="POST",
    )
    try:
        ssl_context = ssl.create_default_context(cafile=certifi.where())
        with request.urlopen(req, timeout=90, context=ssl_context) as response:
            body = response.read().decode("utf-8")
    except error.HTTPError as exc:
        details = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(details) from exc
    parsed = json.loads(body)
    return parsed["choices"][0]["message"]["content"]


def _parse_response(raw: str) -> dict[str, Any]:
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        cleaned = cleaned.replace("json", "", 1).strip()
    return json.loads(cleaned)


def _normalize_claims(
    claims: list[dict[str, Any]],
    documents: list[dict[str, str]],
) -> tuple[list[dict[str, Any]], list[str]]:
    normalized: list[dict[str, Any]] = []
    invalid_examples: list[str] = []
    known_documents = {
        str(document.get("id", "")).strip(): _normalize_search_text(document.get("text", ""))
        for document in documents
        if str(document.get("id", "")).strip()
    }
    for claim in claims:
        normalized_claim = _normalize_claim(claim, known_documents)
        if normalized_claim is None:
            invalid_examples.append(
                f"{claim.get('type', 'missing_type')}::{str(claim.get('statement', ''))[:80]}"
            )
            continue
        normalized.append(normalized_claim)
    return normalized, invalid_examples


def _normalize_claim(
    claim: dict[str, Any],
    known_documents: dict[str, str],
) -> Optional[dict[str, Any]]:
    claim_type = _coerce_claim_type(claim.get("type"))
    statement = str(claim.get("statement", "")).strip()
    evidence_text = str(claim.get("evidence_text", "")).strip()
    source_document_id = str(claim.get("source_document_id", "")).strip()
    if (
        claim_type is None
        or not statement
        or not evidence_text
        or not source_document_id
        or source_document_id not in known_documents
        or _is_noise_text(statement)
        or _is_noise_text(evidence_text)
        or _is_invalid_claim_for_type(claim_type, statement, evidence_text)
    ):
        return None
    normalized_evidence = _normalize_search_text(evidence_text)
    if len(normalized_evidence) < 6 or normalized_evidence not in known_documents[source_document_id]:
        return None
    return {
        "id": claim.get("id") or f"llm-{abs(hash((claim.get('statement', ''), claim.get('evidence_text', ''))))}",
        "type": claim_type,
        "statement": statement,
        "confidence": round(float(claim.get("confidence", 0.68)), 2),
        "status": _coerce_claim_status(claim.get("status")),
        "evidence_text": evidence_text,
        "source_document_id": source_document_id,
        "review_status": "pending",
        "selected": True,
        "notes": "llm_distilled",
    }


def _normalize_profile(profile: dict[str, Any]) -> dict[str, Any]:
    normalized: dict[str, Any] = {}
    for key in (
        "identity",
        "principles",
        "decision_rules",
        "workflows",
        "voice",
        "boundaries",
        "output_patterns",
        "uncertainty_policy",
    ):
        value = profile.get(key, [])
        normalized[key] = [
            item
            for item in [str(raw).strip() for raw in value if str(raw).strip()]
            if not _is_noise_text(item)
        ]
    return normalized


def _normalize_preview(payload: dict[str, Any]) -> dict[str, Any]:
    reason_trace = payload.get("reason_trace", {})
    if not isinstance(reason_trace, dict):
        reason_trace = {}

    return {
        "response": str(payload.get("response", "")).strip(),
        "reason_trace": {
            "principles": _string_list(reason_trace.get("principles")),
            "workflows": _string_list(reason_trace.get("workflows")),
            "boundaries": _string_list(reason_trace.get("boundaries")),
            "voice": _string_list(reason_trace.get("voice")),
        },
        "warnings": _string_list(payload.get("warnings"), limit=6),
    }


def _normalize_preview_feedback(payload: dict[str, Any], known_claim_ids: set[str]) -> dict[str, Any]:
    suggestions = payload.get("suggestions", [])
    if not isinstance(suggestions, list):
        suggestions = []

    normalized_suggestions: list[dict[str, Any]] = []
    for index, suggestion in enumerate(suggestions[:5]):
        if not isinstance(suggestion, dict):
            continue
        section = str(suggestion.get("section", "")).strip()
        if section not in {"principles", "decision_rules", "workflows", "voice", "boundaries"}:
            continue
        suggested_text = str(suggestion.get("suggested_text", "")).strip()
        if not suggested_text:
            continue
        raw_target_claim_ids = suggestion.get("target_claim_ids", [])
        if not isinstance(raw_target_claim_ids, list):
            raw_target_claim_ids = []
        normalized_suggestions.append(
            {
                "id": f"feedback-{index}-{abs(hash((section, suggested_text)))}",
                "section": section,
                "title": str(suggestion.get("title", "")).strip() or "训练建议",
                "suggested_text": suggested_text,
                "reason": str(suggestion.get("reason", "")).strip() or "基于本次试运行反馈生成。",
                "target_claim_ids": [
                    str(item).strip()
                    for item in raw_target_claim_ids[:3]
                    if str(item).strip() and str(item).strip() in known_claim_ids
                ],
            }
        )

    return {
        "summary": str(payload.get("summary", "")).strip() or "建议先修正这次反馈暴露出的关键偏差。",
        "suggestions": normalized_suggestions,
    }


def _normalize_preview_compare(payload: dict[str, Any]) -> dict[str, Any]:
    winner = str(payload.get("winner", "")).strip().lower()
    if winner not in {"baseline", "candidate", "tie"}:
        winner = "tie"
    return {
        "winner": winner,
        "rationale": str(payload.get("rationale", "")).strip() or "两版差异不明显，建议人工复核。",
        "baseline_score": _coerce_score(payload.get("baseline_score"), default=3),
        "candidate_score": _coerce_score(payload.get("candidate_score"), default=3),
    }


def _normalize_benchmark_tasks(payload: dict[str, Any]) -> list[dict[str, Any]]:
    raw_tasks = payload.get("tasks", [])
    if not isinstance(raw_tasks, list):
        return []
    normalized_tasks: list[dict[str, Any]] = []
    seen: set[str] = set()
    generated_at = datetime.now(timezone.utc).isoformat()
    for index, task in enumerate(raw_tasks[:6]):
        if not isinstance(task, dict):
            continue
        title = str(task.get("title", "")).strip()
        scenario = str(task.get("scenario", "")).strip() or "做判断"
        prompt = str(task.get("prompt", "")).strip()
        source_hint = str(task.get("source_hint", "")).strip()
        key = _normalize_search_text(f"{title}::{prompt}")
        if not title or not prompt or key in seen or _is_noise_text(prompt):
            continue
        seen.add(key)
        normalized_tasks.append(
            {
                "id": f"benchmark-{index}-{abs(hash(key))}",
                "title": title[:120],
                "scenario": scenario[:80],
                "prompt": prompt[:4000],
                "source_hint": source_hint[:240],
                "generated_at": generated_at,
            }
        )
    return normalized_tasks


def _fallback_benchmark_tasks(
    documents: list[dict[str, str]],
    profile: dict[str, Any],
    claims: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    principles = _string_list(profile.get("principles"), limit=2)
    decision_rules = _string_list(profile.get("decision_rules"), limit=2)
    workflows = _string_list(profile.get("workflows"), limit=2)
    boundaries = _string_list(profile.get("boundaries"), limit=1)
    doc_types = {str(doc.get("document_type", "")).strip() for doc in documents}
    generated_at = datetime.now(timezone.utc).isoformat()
    tasks: list[dict[str, Any]] = [
        {
            "id": "benchmark-reply",
            "title": "典型工作回复",
            "scenario": "写回复",
            "prompt": "请基于我平时的判断方式与边界感，回复一条需要先判断价值、再控制承诺范围的合作或沟通请求。",
            "source_hint": "检验表达方式、判断顺序和边界感。",
            "generated_at": generated_at,
        },
        {
            "id": "benchmark-decision",
            "title": "机会取舍判断",
            "scenario": "做判断",
            "prompt": "面对一个需要投入时间和资源的新机会，请先给出是否值得推进的判断，再说明依据、风险和边界。",
            "source_hint": "检验决策规则与取舍逻辑。",
            "generated_at": generated_at,
        },
    ]
    if workflows or "prd" in doc_types or "proposal" in doc_types:
        tasks.append(
            {
                "id": "benchmark-proposal",
                "title": "模糊想法成方案",
                "scenario": "写方案",
                "prompt": "把一个模糊想法整理成一页可执行方案，体现我的推进顺序、重点取舍和表达风格。",
                "source_hint": "检验工作流与方案组织能力。",
                "generated_at": generated_at,
            }
        )
    if boundaries or "reply_draft" in doc_types:
        tasks.append(
            {
                "id": "benchmark-boundary",
                "title": "边界与承诺处理",
                "scenario": "控边界",
                "prompt": "遇到一个需要谨慎承诺的请求时，请给出既推进事情又守住边界的回应。",
                "source_hint": "检验边界感与风险处理。",
                "generated_at": generated_at,
            }
        )
    if decision_rules or "retrospective" in doc_types or any(claim.get("type") == "workflow" for claim in claims):
        tasks.append(
            {
                "id": "benchmark-breakdown",
                "title": "目标拆解推进",
                "scenario": "拆任务",
                "prompt": "请把一个目标拆成可执行步骤，体现我通常的推进节奏、优先级判断和下一步意识。",
                "source_hint": "检验任务拆解、优先级与推进节奏。",
                "generated_at": generated_at,
            }
        )
    if principles:
        tasks.append(
            {
                "id": "benchmark-review",
                "title": "复盘与校正",
                "scenario": "复盘",
                "prompt": "回看一次执行结果，请按我的风格做一段复盘：先判断问题，再说明原因与下一步改进。",
                "source_hint": "检验原则驱动的复盘方式。",
                "generated_at": generated_at,
            }
        )
    return tasks[:6]


def _coerce_claim_type(raw_type: Any) -> Optional[str]:
    if not isinstance(raw_type, str):
        return None
    value = raw_type.strip()
    if value in CLAIM_TYPE_VALUES:
        return value
    aliases = {
        "preference_rule": "preference",
        "decision": "decision_rule",
        "rule": "decision_rule",
        "style": "voice_pattern",
        "voice": "voice_pattern",
        "tone": "voice_pattern",
        "constraint": "boundary",
    }
    return aliases.get(value)


def _string_list(raw: Any, limit: int = 4) -> list[str]:
    if not isinstance(raw, list):
        return []
    normalized = [str(item).strip() for item in raw if str(item).strip()]
    return normalized[:limit]


def _coerce_score(raw: Any, default: int = 3) -> int:
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return default
    return max(1, min(5, value))


def _coerce_claim_status(raw_status: Any) -> str:
    if isinstance(raw_status, str) and raw_status in {"EXTRACTED", "INFERRED", "AMBIGUOUS"}:
        return raw_status
    return "INFERRED"


def _compact_error(exc: Exception) -> str:
    return str(exc).strip().replace("\n", " ")[:240] or exc.__class__.__name__


def _has_profile_content(profile: dict[str, Any]) -> bool:
    return any(isinstance(values, list) and values for values in profile.values())


def _normalize_search_text(value: str) -> str:
    return " ".join(value.split()).strip().lower()


def _is_noise_text(value: str) -> bool:
    lowered = value.strip().lower()
    if not lowered:
        return True
    if any(marker in lowered for marker in LLM_NOISE_MARKERS):
        return True
    if re.search(r"<[^>]+>", value):
        return True
    if value.count("|") >= 3:
        return True
    if value.count("{") + value.count("}") >= 2:
        return True
    if re.search(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", value):
        return True
    return False


def _is_invalid_claim_for_type(claim_type: str, statement: str, evidence_text: str) -> bool:
    if claim_type == "identity" and not _looks_like_identity_statement(statement):
        return True
    combined = f"{statement}\n{evidence_text}".lower()
    if any(
        marker in combined
        for marker in (
            "query：",
            "query:",
            "用户 query",
            "judge prompt",
            "agent 编排逻辑评审员",
            "agent 参数填写评审员",
            "图片生成质量评审员",
            "视频生成质量评审员",
        )
    ):
        return True
    return False


def _looks_like_identity_statement(value: str) -> bool:
    cleaned = value.strip()
    if not cleaned:
        return False
    return bool(
        re.search(
            r"^(我是|我负责|我主要|我的工作是|我的角色是|作为.+我|i am|i'm|my role is)",
            cleaned,
            re.IGNORECASE,
        )
    )


def _meta(
    llm_used: bool,
    llm_error: Optional[str],
    invalid_claims_dropped: int = 0,
    invalid_claim_examples: Optional[list[str]] = None,
) -> dict[str, Any]:
    return {
        "llm_used": llm_used,
        "llm_error": llm_error,
        "invalid_claims_dropped": invalid_claims_dropped,
        "invalid_claim_examples": invalid_claim_examples or [],
    }
