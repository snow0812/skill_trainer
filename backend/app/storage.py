import json
import os
import shutil
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional, Union
from uuid import uuid4

from .config import DATABASE_PATH, PROJECTS_ROOT, ensure_data_dirs
from .services.ingest import normalize_document
from .schemas import (
    BenchmarkTask,
    ClaimCreate,
    ClaimUpdate,
    ClaimSummary,
    DistillationMeta,
    DocumentDetail,
    DocumentSummary,
    ExportedFile,
    ProfileSections,
    ProfileUpdate,
    ProjectDetail,
    ProjectSummary,
)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso_now() -> str:
    return utc_now().isoformat()


def ensure_initialized() -> None:
    ensure_data_dirs()
    with sqlite3.connect(DATABASE_PATH) as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                filename TEXT NOT NULL,
                media_type TEXT NOT NULL,
                document_type TEXT NOT NULL DEFAULT 'generic',
                raw_path TEXT NOT NULL,
                normalized_path TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        columns = {
            row[1] for row in connection.execute("PRAGMA table_info(documents)").fetchall()
        }
        if "document_type" not in columns:
            connection.execute(
                "ALTER TABLE documents ADD COLUMN document_type TEXT NOT NULL DEFAULT 'generic'"
            )
        connection.commit()


def get_connection() -> sqlite3.Connection:
    ensure_initialized()
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def get_project_paths(project_id: str) -> dict[str, Path]:
    root = PROJECTS_ROOT / project_id
    paths = {
        "root": root,
        "raw": root / "raw",
        "normalized": root / "normalized",
        "graph": root / "graph",
        "exports": root / "exports" / "user-operating-system-skill",
    }
    for path in paths.values():
        if path.suffix:
            continue
        path.mkdir(parents=True, exist_ok=True)
    return paths


def create_project(name: str) -> ProjectSummary:
    project_id = uuid4().hex
    created_at = iso_now()
    get_project_paths(project_id)
    with get_connection() as connection:
        connection.execute(
            "INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)",
            (project_id, name.strip(), created_at),
        )
        connection.commit()
    return ProjectSummary(id=project_id, name=name.strip(), created_at=created_at)


def list_projects() -> list[ProjectSummary]:
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT id, name, created_at FROM projects ORDER BY created_at DESC"
        ).fetchall()
    return [ProjectSummary.model_validate(dict(row)) for row in rows]


def require_project(project_id: str) -> ProjectSummary:
    with get_connection() as connection:
        row = connection.execute(
            "SELECT id, name, created_at FROM projects WHERE id = ?",
            (project_id,),
        ).fetchone()
    if row is None:
        raise KeyError(project_id)
    return ProjectSummary.model_validate(dict(row))


def add_document(
    project_id: str,
    filename: str,
    media_type: str,
    document_type: str,
    content: bytes,
    normalized_text: str,
) -> DocumentSummary:
    document_id = uuid4().hex
    paths = get_project_paths(project_id)
    safe_name = filename.replace("/", "_")
    raw_path = paths["raw"] / f"{document_id}__{safe_name}"
    normalized_path = paths["normalized"] / f"{document_id}.txt"
    raw_path.write_bytes(content)
    normalized_path.write_text(normalized_text, encoding="utf-8")

    created_at = iso_now()
    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO documents (
                id, project_id, filename, media_type, document_type, raw_path, normalized_path, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                document_id,
                project_id,
                filename,
                media_type,
                document_type,
                str(raw_path),
                str(normalized_path),
                created_at,
            ),
        )
        connection.commit()

    return DocumentSummary(
        id=document_id,
        filename=filename,
        media_type=media_type,
        document_type=document_type,
        created_at=created_at,
        normalized_preview=normalized_text[:240],
    )


def list_documents(project_id: str) -> list[DocumentSummary]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT id, filename, media_type, document_type, raw_path, normalized_path, created_at
            FROM documents
            WHERE project_id = ?
            ORDER BY created_at DESC
            """,
            (project_id,),
        ).fetchall()

    documents: list[DocumentSummary] = []
    for row in rows:
        normalized_text = _load_current_normalized_text(
            filename=row["filename"],
            raw_path=Path(row["raw_path"]),
            normalized_path=Path(row["normalized_path"]),
        )
        preview = normalized_text[:240]
        documents.append(
            DocumentSummary(
                id=row["id"],
                filename=row["filename"],
                media_type=row["media_type"],
                document_type=row["document_type"],
                created_at=row["created_at"],
                normalized_preview=preview,
            )
        )
    return documents


def get_document_detail(project_id: str, document_id: str) -> DocumentDetail:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT id, filename, media_type, document_type, raw_path, normalized_path, created_at
            FROM documents
            WHERE project_id = ? AND id = ?
            """,
            (project_id, document_id),
        ).fetchone()
    if row is None:
        raise KeyError(document_id)
    normalized_text = _load_current_normalized_text(
        filename=row["filename"],
        raw_path=Path(row["raw_path"]),
        normalized_path=Path(row["normalized_path"]),
    )
    return DocumentDetail(
        id=row["id"],
        filename=row["filename"],
        media_type=row["media_type"],
        document_type=row["document_type"],
        created_at=row["created_at"],
        normalized_preview=normalized_text[:240],
        normalized_text=normalized_text,
    )


def load_document_texts(project_id: str) -> list[dict[str, str]]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT id, filename, media_type, document_type, raw_path, normalized_path
            FROM documents
            WHERE project_id = ?
            ORDER BY created_at DESC
            """,
            (project_id,),
        ).fetchall()
    return [
        {
            "id": row["id"],
            "filename": row["filename"],
            "media_type": row["media_type"],
            "document_type": row["document_type"],
            "text": _load_current_normalized_text(
                filename=row["filename"],
                raw_path=Path(row["raw_path"]),
                normalized_path=Path(row["normalized_path"]),
            ),
        }
        for row in rows
    ]


def graph_paths(project_id: str) -> tuple[Path, Path]:
    paths = get_project_paths(project_id)
    return paths["graph"] / "claims.json", paths["graph"] / "profile.json"


def meta_path(project_id: str) -> Path:
    paths = get_project_paths(project_id)
    return paths["graph"] / "meta.json"


def benchmark_tasks_path(project_id: str) -> Path:
    paths = get_project_paths(project_id)
    return paths["graph"] / "benchmark_tasks.json"


def _atomic_write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_suffix(f"{path.suffix}.tmp")
    temp_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    os.replace(temp_path, path)


def _load_current_normalized_text(filename: str, raw_path: Path, normalized_path: Path) -> str:
    current = normalized_path.read_text(encoding="utf-8") if normalized_path.exists() else ""
    suffix = Path(filename).suffix.lower()
    if suffix not in {".html", ".htm"}:
        return current
    if not raw_path.exists():
        return current

    refreshed = normalize_document(filename, raw_path.read_bytes())
    if refreshed != current:
        normalized_path.write_text(refreshed, encoding="utf-8")
        return refreshed
    return current


def save_distillation(
    project_id: str, claims: list[dict[str, Any]], profile: dict[str, Any]
) -> None:
    claims_path, profile_path = graph_paths(project_id)
    validated_claims = [ClaimSummary.model_validate(claim).model_dump() for claim in claims]
    validated_profile = ProfileSections.model_validate(profile).model_dump()
    _atomic_write_json(claims_path, validated_claims)
    _atomic_write_json(profile_path, validated_profile)


def save_profile(
    project_id: str,
    profile: Union[ProfileUpdate, ProfileSections, dict[str, Any]],
) -> None:
    _, profile_path = graph_paths(project_id)
    payload = (
        profile.model_dump()
        if isinstance(profile, (ProfileUpdate, ProfileSections))
        else profile
    )
    validated_profile = ProfileSections.model_validate(payload).model_dump()
    _atomic_write_json(profile_path, validated_profile)


def save_claims(
    project_id: str,
    claims: list[Union[dict[str, Any], ClaimSummary]],
) -> None:
    claims_path, _ = graph_paths(project_id)
    payload = [
        claim.model_dump() if isinstance(claim, ClaimSummary) else claim for claim in claims
    ]
    validated_claims = [ClaimSummary.model_validate(claim).model_dump() for claim in payload]
    _atomic_write_json(claims_path, validated_claims)


def load_claims(project_id: str) -> list[ClaimSummary]:
    claims_path, _ = graph_paths(project_id)
    if not claims_path.exists():
        return []
    payload = json.loads(claims_path.read_text(encoding="utf-8"))
    valid_claims: list[ClaimSummary] = []
    changed = False
    for item in payload:
        try:
            valid_claims.append(ClaimSummary.model_validate(item))
        except Exception:
            changed = True
    if changed:
        save_claims(project_id, valid_claims)
    return valid_claims


def update_claim(project_id: str, claim_id: str, update: ClaimUpdate) -> list[ClaimSummary]:
    claims = load_claims(project_id)
    updated = False
    for claim in claims:
        if claim.id != claim_id:
            continue
        if update.review_status is not None:
            claim.review_status = update.review_status
        if update.selected is not None:
            claim.selected = update.selected
        if update.notes is not None:
            claim.notes = update.notes.strip()
        updated = True
        break
    if not updated:
        raise KeyError(claim_id)
    save_claims(project_id, claims)
    return claims


def upsert_claim(project_id: str, claim: Union[dict[str, Any], ClaimCreate, ClaimSummary]) -> list[ClaimSummary]:
    claims = load_claims(project_id)
    payload = claim.model_dump() if isinstance(claim, (ClaimCreate, ClaimSummary)) else dict(claim)
    candidate = ClaimSummary.model_validate(payload)
    updated = False
    for index, current in enumerate(claims):
        if current.id == candidate.id:
            claims[index] = candidate
            updated = True
            break
    if not updated:
        claims.append(candidate)
    save_claims(project_id, claims)
    return claims


def load_profile(project_id: str) -> Optional[ProfileSections]:
    _, profile_path = graph_paths(project_id)
    if not profile_path.exists():
        return None
    try:
        payload = json.loads(profile_path.read_text(encoding="utf-8"))
        return ProfileSections.model_validate(payload)
    except Exception:
        return None


def save_distillation_meta(
    project_id: str,
    meta: Union[DistillationMeta, dict[str, Any]],
) -> None:
    payload = meta.model_dump(mode="json") if isinstance(meta, DistillationMeta) else meta
    _atomic_write_json(meta_path(project_id), payload)


def load_distillation_meta(project_id: str) -> Optional[DistillationMeta]:
    path = meta_path(project_id)
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return DistillationMeta.model_validate(payload)
    except Exception:
        return None


def save_benchmark_tasks(
    project_id: str,
    tasks: list[Union[BenchmarkTask, dict[str, Any]]],
) -> None:
    payload = [task.model_dump(mode="json") if isinstance(task, BenchmarkTask) else task for task in tasks]
    validated_tasks = [BenchmarkTask.model_validate(task).model_dump(mode="json") for task in payload]
    _atomic_write_json(benchmark_tasks_path(project_id), validated_tasks)


def load_benchmark_tasks(project_id: str) -> list[BenchmarkTask]:
    path = benchmark_tasks_path(project_id)
    if not path.exists():
        return []
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return []
    valid_tasks: list[BenchmarkTask] = []
    changed = False
    for item in payload:
        try:
            valid_tasks.append(BenchmarkTask.model_validate(item))
        except Exception:
            changed = True
    if changed:
        save_benchmark_tasks(project_id, valid_tasks)
    return valid_tasks


def reset_export_dir(project_id: str) -> Path:
    export_dir = get_project_paths(project_id)["exports"]
    if export_dir.exists():
        shutil.rmtree(export_dir)
    export_dir.mkdir(parents=True, exist_ok=True)
    return export_dir


def load_exported_files(project_id: str) -> list[ExportedFile]:
    export_dir = get_project_paths(project_id)["exports"]
    if not export_dir.exists():
        return []
    files: list[ExportedFile] = []
    for path in sorted(export_dir.glob("*")):
        if not path.is_file():
            continue
        files.append(
            ExportedFile(
                filename=path.name,
                relative_path=str(path.relative_to(export_dir.parent.parent)),
                content=path.read_text(encoding="utf-8"),
            )
        )
    return files


def hydrate_project(project_id: str) -> ProjectDetail:
    project = require_project(project_id)
    return ProjectDetail(
        **project.model_dump(),
        documents=list_documents(project_id),
        claims=load_claims(project_id),
        profile=load_profile(project_id),
        benchmark_tasks=load_benchmark_tasks(project_id),
        exported_files=load_exported_files(project_id),
        distillation_meta=load_distillation_meta(project_id),
    )
