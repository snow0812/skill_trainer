# User Twin Studio UI/UX Redesign

## Product Positioning

User Twin Studio is not a file manager or prompt console. It is a studio for training, previewing, and publishing a personal twin.

The product should move users through a single narrative:

1. Feed materials
2. See how the system understands them
3. Correct the understanding
4. Preview the twin on real tasks
5. Publish the skill

## Core Principles

1. One page, one primary job
2. Show understanding before showing raw data
3. Hide complexity by default, reveal detail on demand
4. Keep evidence as a secondary layer, not the primary surface
5. Export is the last step, not the homepage

## Top-Level Navigation

- Overview
- Materials
- Understanding
- Training
- Preview
- Publish

## Global Shell

### Top Bar

- Project name
- Maturity label: `资料不足`, `可训练`, `可试运行`, `可发布`
- Current system message
- Primary actions: `重新蒸馏`, `试运行`, `发布`

### Left Sidebar

- New project form
- Project switcher
- Stage navigation
- Lightweight status summary

### Evidence Drawer

Persistent right-side drawer triggered from any page.

Contains:

- document filename
- detected type
- normalized content
- source context

## Page Goals

### Overview

Answer: "How mature is this twin?"

Content:

- twin summary hero
- identity / principles / decision / work / voice / boundaries cards
- readiness panel
- next best actions

### Materials

Answer: "What have I given the system, and what is missing?"

Content:

- upload area
- document type shelves
- material health cards
- document detail drawer trigger

### Understanding

Answer: "How does the system currently understand me?"

Content:

- high-level understanding modules
- confidence and evidence entry points
- uncertainty panel

### Training

Answer: "Which conclusions do I want to keep, rewrite, or reject?"

Content:

- editable profile sections
- grouped claim cards
- evidence shortcuts
- rebuild action

### Preview

Answer: "Does this twin feel like me in practice?"

Content:

- scenario picker
- freeform test input
- generated preview response
- reason trace based on principles / workflows / boundaries
- quick feedback buttons

### Publish

Answer: "Is this ready to ship, and where can I use it?"

Content:

- publish summary
- export cards by platform
- export bundle preview
- release notes and gaps

## Information Architecture

### Domain Objects Exposed to UI

- Project
- Document
- Profile sections
- Claims
- Distillation meta
- Export bundle

### Complexity Placement

- Primary UI: summaries, cards, progress, recommended actions
- Secondary UI: claims, evidence, confidence, invalid claim diagnostics
- Tertiary UI: raw file contents, exported markdown, technical metadata

## Frontend Route Plan

- `/` -> redirect to `/overview`
- `/overview`
- `/materials`
- `/understanding`
- `/training`
- `/preview`
- `/publish`

## Frontend Component Tree

### Shell

- `App`
- `StudioProvider`
- `StudioLayout`
- `ProjectSidebar`
- `TopBar`
- `StageNav`
- `EvidenceDrawer`

### Shared Components

- `HeroPanel`
- `SectionPreviewCard`
- `ReadinessPanel`
- `NextStepCard`
- `DocumentCard`
- `DocumentTypeShelf`
- `HealthMetricCard`
- `EditableSectionCard`
- `TrainingClaimCard`
- `PreviewScenarioCard`
- `PublishCard`

### Pages

- `OverviewPage`
- `MaterialsPage`
- `UnderstandingPage`
- `TrainingPage`
- `PreviewPage`
- `PublishPage`

## State Model

### Studio Store

Global state managed in a single provider for now:

- projects
- activeProjectId
- activeProject
- loading
- message
- newProjectName
- pendingFiles
- editableProfile
- distillMode
- llmConfigured
- selectedDocument
- previewPrompt
- previewScenario

### Derived State

- documentTypeCounts
- learnedPatternClaims
- readiness status
- top insights
- next actions

## Interaction Flows

### Create Project

1. User enters project name
2. Project is created
3. User lands in `Materials`

### Distill

1. User starts distillation from top bar
2. System updates project
3. User is encouraged to go to `Understanding`

### Training

1. User accepts / rewrites / rejects claims
2. User updates profile sections
3. User rebuilds profile from curated claims
4. User proceeds to `Preview`

### Publish

1. User exports target format
2. User reviews generated bundle
3. User can iterate back to Training or Materials

## Implementation Order

1. Introduce router and shell
2. Move current single-page state into a shared studio provider
3. Split the current page into six route-level pages
4. Add evidence drawer and preview page
5. Improve visual hierarchy and staged recommendations

## Non-Goals For This UI Refactor

- background job system
- full preview inference engine
- multi-window collaboration
- version compare UI

Those can be added after the shell and stage-based flow are stable.
