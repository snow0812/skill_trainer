# Skill Trainer

[English](./README.md) | 简体中文

一个本地优先的个人 AI skill 训练工作台。用户上传文档、聊天、图片或项目资料后，系统会蒸馏出一个尽量与用户在表达、判断、工作方式和边界上保持一致的可复用 skill / profile，并可用于下游 agent 与自动化场景。

## 项目能做什么

Skill Trainer 的目标，是把用户的资料沉淀为一个可复用的个人能力包，让下游系统更像“这个用户本人”去思考、表达与执行任务。

当前 MVP 包含：

- `frontend/`：基于 React + Vite 的工作台，用于创建项目、上传资料、触发蒸馏、查看导出结果
- `backend/`：基于 FastAPI 的本地服务，负责存储、归一化、规则蒸馏和 skill 导出
- 支持 claim 校正：接受、拒绝、保留但不导出、补充备注
- 支持 profile 校正：直接编辑 `principles`、`workflows`、`boundaries` 等区块
- 支持基于已选 claims 重新生成 profile
- 支持 `heuristic` / `llm` / `hybrid` 三种蒸馏模式
- 支持按 claim 回看原始资料文本
- 支持自动识别资料类型：`PRD`、`方案`、`复盘`、`回复草稿`、`周报`、`笔记`、`通用`

## 下游应用场景

导出的 skill / profile 可以作为这些系统的基础能力层：

- 个人 agent / copilot
- 工作流自动化系统
- 可复用的 prompt / profile 包
- 助手行为评测与对齐流水线
- 基于用户真实工作资料训练的垂类助手

## 核心链路

1. 创建项目
2. 上传资料
3. 归一化文档内容
4. 蒸馏 `identity`、`principles`、`decision_rules`、`workflows`、`voice`、`boundaries`、`output_patterns`
5. 导出 `user-operating-system` skill 目录

## 本地运行

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e .
uvicorn app.main:app --reload
```

如需启用 LLM 蒸馏，请配置 OpenAI 兼容接口。推荐复制 `backend/.env.example` 为 `backend/.env` 并填写，服务启动时会自动加载。

变量优先级：

- `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL`：优先使用官方变量名
- `USER_TWIN_LLM_*`：仅当对应的 `OPENAI_*` 未设置时作为备用

例如：

```bash
export OPENAI_API_KEY=sk-...
export OPENAI_MODEL=gpt-4o-mini
```

模式说明：

- `heuristic`：完全本地的规则抽取
- `llm`：优先使用 LLM 做证据约束蒸馏，失败时回退
- `hybrid`：合并启发式与 LLM 结果

### Frontend

```bash
cd frontend
npm install
npm run dev
```

如需自定义前端 API 地址，可设置：

```bash
VITE_API_BASE=http://127.0.0.1:8000/api
```

## 后续方向

- 接入 OCR / 视觉模型，真正利用图片资料
- 将当前规则抽取升级为证据约束的 LLM 提炼
- 增加用户校正、冲突合并和评测流程
