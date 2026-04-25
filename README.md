# Skill Trainer

English | [简体中文](./README.zh-CN.md)

A local-first studio for training personal AI skills from documents, chats, and workflows, ready for downstream agents and real-world task automation.

## What It Does

Skill Trainer turns user materials into a reusable personal skill/profile that stays aligned with how the user writes, decides, works, and sets boundaries.

Current MVP:

- `frontend/`: React + Vite console for project creation, material upload, distillation, and export
- `backend/`: FastAPI service for local storage, normalization, rule distillation, and skill export
- claim review flow: accept, reject, keep but do not export, or annotate
- profile editing for `principles`, `workflows`, `boundaries`, and related sections
- regenerate profile from selected claims
- three distillation modes: `heuristic`, `llm`, `hybrid`
- trace claims back to source material
- auto-detect input types such as `PRD`, `plan`, `retro`, `draft reply`, `weekly report`, `notes`, and `general`

## Downstream Applications

The exported skill/profile can be used as a foundation for:

- personal agents and copilots
- workflow automation systems
- reusable prompt and profile packages
- evaluation and alignment pipelines for assistant behavior
- domain-specific assistants trained on a user's work artifacts

## Core Flow

1. Create a project
2. Upload source materials
3. Normalize document content
4. Distill `identity`, `principles`, `decision_rules`, `workflows`, `voice`, `boundaries`, and `output_patterns`
5. Export a `user-operating-system` skill directory

## Local Development

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e .
uvicorn app.main:app --reload
```

To enable LLM distillation, configure an OpenAI-compatible endpoint. Recommended: copy `backend/.env.example` to `backend/.env` and fill in the values. The backend loads it automatically at startup.

Variable priority:

- `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL`: preferred official names
- `USER_TWIN_LLM_*`: fallback names used only when the corresponding `OPENAI_*` values are not set

Example:

```bash
export OPENAI_API_KEY=sk-...
export OPENAI_MODEL=gpt-4o-mini
```

Modes:

- `heuristic`: fully local rule-based extraction
- `llm`: LLM-first evidence-constrained distillation with fallback behavior
- `hybrid`: merge heuristic and LLM outputs

### Frontend

```bash
cd frontend
npm install
npm run dev
```

To customize the frontend API endpoint:

```bash
VITE_API_BASE=http://127.0.0.1:8000/api
```

## Roadmap

- add OCR and vision support for image-heavy materials
- upgrade rule extraction into evidence-constrained LLM distillation
- expand correction, conflict resolution, and evaluation workflows
