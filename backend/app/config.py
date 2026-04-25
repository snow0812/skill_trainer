import os
from pathlib import Path

from dotenv import load_dotenv

# 在读取环境变量之前加载 backend/.env（以及仓库根目录 .env），避免仅依赖「当前 shell 是否 export」
APP_ROOT = Path(__file__).resolve().parents[1]
_REPO_ROOT = APP_ROOT.parent
load_dotenv(_REPO_ROOT / ".env", override=False)
load_dotenv(APP_ROOT / ".env", override=False)

DATA_ROOT = APP_ROOT / "data"
PROJECTS_ROOT = DATA_ROOT / "projects"
DATABASE_PATH = DATA_ROOT / "app.db"

# OpenAI 官方环境变量优先，其次为本项目 USER_TWIN_LLM_*（与官方 SDK / 习惯一致）
LLM_API_KEY = os.getenv("OPENAI_API_KEY", "").strip() or os.getenv("USER_TWIN_LLM_API_KEY", "").strip()
LLM_BASE_URL = os.getenv("OPENAI_BASE_URL", "").strip() or os.getenv("USER_TWIN_LLM_BASE_URL", "").strip()
if not LLM_BASE_URL and LLM_API_KEY:
    LLM_BASE_URL = "https://api.openai.com/v1"
LLM_MODEL = (
    os.getenv("OPENAI_MODEL", "").strip()
    or os.getenv("USER_TWIN_LLM_MODEL", "").strip()
    or "gpt-4.1-mini"
)


def ensure_data_dirs() -> None:
    DATA_ROOT.mkdir(parents=True, exist_ok=True)
    PROJECTS_ROOT.mkdir(parents=True, exist_ok=True)


def llm_is_configured() -> bool:
    return bool(LLM_BASE_URL and LLM_API_KEY and LLM_MODEL)
