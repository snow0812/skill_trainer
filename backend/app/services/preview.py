from typing import Any

from ..schemas import (
    PreviewCompareResponse,
    PreviewFeedbackResponse,
    PreviewReasonTrace,
    PreviewResponse,
    PreviewSuggestion,
    ProfileSections,
)
from .llm_distill import llm_compare_preview_pair, llm_generate_preview_feedback, llm_preview_user_twin


def run_user_twin_preview(
    project_name: str,
    scenario: str,
    prompt: str,
    profile: ProfileSections,
    claims: list[dict[str, Any]],
) -> PreviewResponse:
    selected_claims = [
        claim
        for claim in claims
        if claim.get("selected", True) and claim.get("review_status") != "rejected"
    ]
    fallback_reason_trace = _build_reason_trace(profile)
    fallback_warnings = _build_warnings(profile, selected_claims)
    fallback_response = _fallback_response(prompt, scenario, profile)

    llm_preview, llm_meta = llm_preview_user_twin(
        project_name=project_name,
        scenario=scenario,
        prompt=prompt,
        profile=profile.model_dump(),
        claims=selected_claims,
    )
    llm_used = bool(llm_meta.get("llm_used"))
    llm_error = llm_meta.get("llm_error")

    if llm_used and llm_preview.get("response"):
        trace = llm_preview.get("reason_trace") or {}
        reason_trace = PreviewReasonTrace(
            principles=trace.get("principles") or fallback_reason_trace.principles,
            workflows=trace.get("workflows") or fallback_reason_trace.workflows,
            boundaries=trace.get("boundaries") or fallback_reason_trace.boundaries,
            voice=trace.get("voice") or fallback_reason_trace.voice,
        )
        return PreviewResponse(
            response=llm_preview["response"],
            reason_trace=reason_trace,
            warnings=_merge_warnings(llm_preview.get("warnings") or [], fallback_warnings),
            llm_used=True,
            llm_error=None,
        )

    warnings = list(fallback_warnings)
    if llm_error:
        warnings.insert(0, f"本次试运行已回退到本地生成：{llm_error}")
    return PreviewResponse(
        response=fallback_response,
        reason_trace=fallback_reason_trace,
        warnings=warnings,
        llm_used=False,
        llm_error=llm_error,
    )


def generate_preview_training_suggestions(
    scenario: str,
    prompt: str,
    response: str,
    feedback: str,
    feedback_note: str,
    profile: ProfileSections,
    claims: list[dict[str, Any]],
) -> PreviewFeedbackResponse:
    selected_claims = [
        claim
        for claim in claims
        if claim.get("selected", True) and claim.get("review_status") != "rejected"
    ]
    fallback = _fallback_feedback(feedback, feedback_note)
    llm_feedback, llm_meta = llm_generate_preview_feedback(
        scenario=scenario,
        prompt=prompt,
        response=response,
        feedback=feedback,
        feedback_note=feedback_note,
        profile=profile.model_dump(),
        claims=selected_claims,
    )

    if llm_meta.get("llm_used") and llm_feedback.get("suggestions"):
        suggestions = [PreviewSuggestion.model_validate(item) for item in llm_feedback["suggestions"]]
        return PreviewFeedbackResponse(
            summary=llm_feedback.get("summary") or fallback.summary,
            suggestions=suggestions,
            llm_used=True,
            llm_error=None,
        )

    return PreviewFeedbackResponse(
        summary=fallback.summary,
        suggestions=fallback.suggestions,
        llm_used=False,
        llm_error=llm_meta.get("llm_error"),
    )


def compare_preview_outputs(
    scenario: str,
    prompt: str,
    baseline_response: str,
    candidate_response: str,
) -> PreviewCompareResponse:
    llm_result, llm_meta = llm_compare_preview_pair(
        scenario=scenario,
        prompt=prompt,
        baseline_response=baseline_response,
        candidate_response=candidate_response,
    )
    if llm_meta.get("llm_used") and llm_result.get("winner"):
        return PreviewCompareResponse(
            winner=llm_result["winner"],
            rationale=llm_result["rationale"],
            baseline_score=llm_result["baseline_score"],
            candidate_score=llm_result["candidate_score"],
            llm_used=True,
            llm_error=None,
        )

    baseline_score = _fallback_similarity_score(prompt, baseline_response)
    candidate_score = _fallback_similarity_score(prompt, candidate_response)
    if candidate_score > baseline_score:
        winner = "candidate"
    elif candidate_score < baseline_score:
        winner = "baseline"
    else:
        winner = "tie"
    rationale = (
        "已回退到本地启发式比较；当前主要按任务命中度和结构完整性粗略打分，建议人工复核。"
    )
    if llm_meta.get("llm_error"):
        rationale = f"{rationale} 回退原因：{llm_meta['llm_error']}"
    return PreviewCompareResponse(
        winner=winner,
        rationale=rationale,
        baseline_score=baseline_score,
        candidate_score=candidate_score,
        llm_used=False,
        llm_error=llm_meta.get("llm_error"),
    )


def _build_reason_trace(profile: ProfileSections) -> PreviewReasonTrace:
    return PreviewReasonTrace(
        principles=profile.principles[:3],
        workflows=profile.workflows[:3],
        boundaries=profile.boundaries[:2],
        voice=profile.voice[:2],
    )


def _build_warnings(profile: ProfileSections, claims: list[dict[str, Any]]) -> list[str]:
    warnings: list[str] = []
    if not profile.boundaries:
        warnings.append("当前边界样本偏少，涉及承诺、让步或资源投入时建议人工复核。")
    if len(profile.decision_rules) < 2:
        warnings.append("决策规则还不够稳定，复杂判断更适合作为草案而不是最终结论。")
    if len(claims) < 6:
        warnings.append("当前纳入试运行的有效 claims 偏少，结果更适合做方向参考。")
    return warnings[:4]


def _fallback_response(
    prompt: str,
    scenario: str,
    profile: ProfileSections,
) -> str:
    lines = [f"场景：{scenario}", f"任务：{prompt.strip()}"]
    if profile.principles:
        lines.append(f"我会先按这些原则判断：{'；'.join(profile.principles[:2])}")
    if profile.decision_rules:
        lines.append(f"决策上我会优先看：{'；'.join(profile.decision_rules[:2])}")
    if profile.workflows:
        lines.append(f"执行时我通常会这样推进：{'；'.join(profile.workflows[:2])}")
    if profile.boundaries:
        lines.append(f"同时我会守住这些边界：{'；'.join(profile.boundaries[:1])}")
    if profile.voice:
        lines.append(f"表达上保持这样的感觉：{'；'.join(profile.voice[:1])}")
    lines.append("如果你要，我下一步可以把这次回答继续展开成完整回复、方案或任务拆解。")
    return "\n".join(lines)


def _merge_warnings(primary: list[str], secondary: list[str]) -> list[str]:
    merged: list[str] = []
    for item in [*primary, *secondary]:
        if item and item not in merged:
            merged.append(item)
    return merged[:6]


def _fallback_feedback(feedback: str, feedback_note: str) -> PreviewFeedbackResponse:
    note_suffix = f" 用户补充：{feedback_note.strip()}" if feedback_note.strip() else ""
    if feedback == "像我":
        return PreviewFeedbackResponse(
            summary="这次输出已经比较接近你，建议把这次成功经验固化成更稳定的表达和流程规则。",
            suggestions=[
                _suggestion(
                    "workflows",
                    "固化成功处理顺序",
                    "面对相似任务时，先给判断，再拆解关键步骤，最后明确边界与下一步。",
                    f"把这次有效的处理顺序固化下来，便于后续复用。{note_suffix}".strip(),
                ),
                _suggestion(
                    "voice",
                    "固化成功表达风格",
                    "表达保持直接、结构化，先给判断，再给依据和动作建议。",
                    f"把这次让你满意的语气沉淀成稳定表达风格。{note_suffix}".strip(),
                ),
            ],
        )

    if feedback == "太保守":
        return PreviewFeedbackResponse(
            summary="这次更像是边界过强，建议放宽保守规则，避免在信息足够时仍然过度防守。",
            suggestions=[
                _suggestion(
                    "boundaries",
                    "边界别压过判断",
                    "在信息已经足够明确时，可以先给出初步判断，再说明需要进一步确认的边界。",
                    f"避免所有高风险场景都只给保守答复。{note_suffix}".strip(),
                ),
                _suggestion(
                    "decision_rules",
                    "允许给出有限判断",
                    "当信息达到可判断阈值时，先给 provisional judgement，再说明不确定部分。",
                    f"让分身在不失控的前提下更有推进感。{note_suffix}".strip(),
                ),
            ],
        )

    if feedback == "逻辑不对":
        return PreviewFeedbackResponse(
            summary="问题主要在判断逻辑而不是语气，应该优先修正决策规则和任务拆解顺序。",
            suggestions=[
                _suggestion(
                    "decision_rules",
                    "补强决策前置条件",
                    "做判断前先确认目标、约束、投入产出和可逆性，再决定是否推进。",
                    f"让分身先按你的判断框架思考，而不是直接产出结论。{note_suffix}".strip(),
                ),
                _suggestion(
                    "workflows",
                    "明确标准处理顺序",
                    "面对模糊任务时，先澄清问题，再给判断，最后给建议或下一步。",
                    f"纠正输出顺序，避免先答后想。{note_suffix}".strip(),
                ),
            ],
        )

    return PreviewFeedbackResponse(
        summary="这次还不够像你，建议优先修正高影响原则、表达方式和边界感。",
        suggestions=[
            _suggestion(
                "principles",
                "补强核心原则",
                "先判断这件事值不值得做，再决定投入多少资源。",
                f"把你最核心的判断原则写得更明确。{note_suffix}".strip(),
            ),
            _suggestion(
                "voice",
                "修正表达风格",
                "表达上保持直接、克制、结构化，不绕弯子。",
                f"让风格更贴近你本人。{note_suffix}".strip(),
            ),
            _suggestion(
                "boundaries",
                "补一条承诺边界",
                "在信息不足时，不替自己承诺时间、交付和长期投入。",
                f"边界感往往最影响“像不像你”。{note_suffix}".strip(),
            ),
        ],
    )


def _fallback_similarity_score(prompt: str, response: str) -> int:
    prompt_tokens = {token for token in prompt.replace("，", " ").replace("。", " ").split() if len(token) >= 2}
    response_tokens = {token for token in response.replace("，", " ").replace("。", " ").split() if len(token) >= 2}
    overlap = len(prompt_tokens & response_tokens)
    score = 2
    if overlap >= 3:
        score += 1
    if any(marker in response for marker in ("先", "然后", "最后", "下一步", "判断", "边界")):
        score += 1
    if len(response.strip()) >= 80:
        score += 1
    return max(1, min(5, score))


def _suggestion(section: str, title: str, suggested_text: str, reason: str) -> PreviewSuggestion:
    return PreviewSuggestion(
        id=f"{section}-{abs(hash((title, suggested_text)))}",
        section=section,
        title=title,
        suggested_text=suggested_text,
        reason=reason,
        target_claim_ids=[],
    )
