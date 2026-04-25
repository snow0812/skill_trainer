import json
from pathlib import Path

from ..schemas import ClaimSummary, ProfileSections


def export_skill_bundle(
    export_dir: Path,
    project_name: str,
    profile: ProfileSections,
    claims: list[ClaimSummary],
) -> None:
    files = {
        "SKILL.md": _skill_md(),
        "identity.md": _section_md("Identity", profile.identity),
        "principles.md": _section_md("Principles", profile.principles),
        "decision-rules.md": _section_md("Decision Rules", profile.decision_rules),
        "workflows.md": _section_md("Workflows", profile.workflows),
        "voice.md": _section_md("Voice", profile.voice),
        "boundaries.md": _section_md("Boundaries", profile.boundaries),
        "output-patterns.md": _section_md("Output Patterns", profile.output_patterns),
        "examples.md": _examples_md(claims),
        "evidence.md": _evidence_md(claims),
        "evals.md": _evals_md(),
        "manifest.json": _manifest_json(project_name, profile, claims),
    }

    for filename, content in files.items():
        (export_dir / filename).write_text(content, encoding="utf-8")


def _skill_md() -> str:
    return """---
name: user-operating-system
description: Responds using the uploaded user's documented identity, principles, decision rules, workflows, voice patterns, and boundaries. Use when drafting on the user's behalf, planning work in the user's style, or answering how the user would likely think and act.
---

# User Operating System

## Quick Start

1. Read `identity.md` for role and self-definition signals.
2. Read `principles.md`, `decision-rules.md`, and `workflows.md` before making recommendations.
3. Use `voice.md` and `output-patterns.md` to align tone and structure.
4. Check `boundaries.md` before committing the user to anything.
5. If evidence is weak or conflicting, say so explicitly and point to `evidence.md`.

## Priority Order

1. Preserve the user's principles and boundaries.
2. Preserve the user's decision logic and workflow.
3. Preserve the user's output structure.
4. Match tone and wording.

## Output Rules

- Separate confirmed facts from inferred tendencies.
- Prefer concise, structured answers with reasoning.
- Do not invent personal commitments, preferences, or beliefs without evidence.
"""


def _section_md(title: str, items: list[str]) -> str:
    body = "\n".join(f"- {item}" for item in items) if items else "- 暂无内容"
    return f"# {title}\n\n{body}\n"


def _evidence_md(claims: list[ClaimSummary]) -> str:
    lines = ["# Evidence", ""]
    curated_claims = [claim for claim in claims if claim.selected and claim.review_status != "rejected"]
    for claim in curated_claims[:30]:
        lines.extend(
            [
                f"## {claim.type}",
                f"- Statement: {claim.statement}",
                f"- Confidence: {claim.confidence}",
                f"- Status: {claim.status}",
                f"- Review status: {claim.review_status}",
                f"- Evidence: {claim.evidence_text}",
                f"- Source document id: {claim.source_document_id}",
                f"- Notes: {claim.notes or '无'}",
                "",
            ]
        )
    if len(lines) == 2:
        lines.append("- 暂无证据")
    return "\n".join(lines)


def _evals_md() -> str:
    return """# Evals

建议至少做以下四类评测：

- 表达一致性：是否像用户本人写作和表达
- 判断一致性：是否使用了用户惯常的评价维度与取舍逻辑
- 工作一致性：是否按用户常见的拆解、推进、交付方式执行
- 边界一致性：证据不足时是否保持克制，不越权承诺
"""


def _examples_md(claims: list[ClaimSummary]) -> str:
    lines = [
        "# Examples",
        "",
        "以下内容是系统从用户资料中学到的流程与产出结构信号，可作为代写和代做时的参考。",
        "",
    ]
    example_claims = [
        claim
        for claim in claims
        if claim.selected
        and claim.review_status != "rejected"
        and claim.type in {"workflow", "artifact_pattern"}
    ][:12]
    for claim in example_claims:
        lines.extend(
            [
                f"## {claim.type}",
                f"- Pattern: {claim.statement}",
                f"- Evidence: {claim.evidence_text}",
                f"- Notes: {claim.notes or '无'}",
                "",
            ]
        )
    if len(example_claims) == 0:
        lines.append("- 暂无流程样本")
    return "\n".join(lines)


def _manifest_json(
    project_name: str,
    profile: ProfileSections,
    claims: list[ClaimSummary],
) -> str:
    payload = {
        "project_name": project_name,
        "claim_count": len(claims),
        "selected_claim_count": len(
            [claim for claim in claims if claim.selected and claim.review_status != "rejected"]
        ),
        "document_type_signals": {
            "workflow": len(
                [
                    claim
                    for claim in claims
                    if claim.type == "workflow" and "文档" in claim.statement
                ]
            ),
            "artifact_pattern": len(
                [
                    claim
                    for claim in claims
                    if claim.type == "artifact_pattern" and "文档" in claim.statement
                ]
            ),
        },
        "sections": {
            "identity": len(profile.identity),
            "principles": len(profile.principles),
            "decision_rules": len(profile.decision_rules),
            "workflows": len(profile.workflows),
            "voice": len(profile.voice),
            "boundaries": len(profile.boundaries),
            "output_patterns": len(profile.output_patterns),
        },
    }
    return json.dumps(payload, ensure_ascii=False, indent=2)
