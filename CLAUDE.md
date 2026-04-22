# CLAUDE.md

## Project Overview

KubeVM UI — a full-stack web application for managing KubeVirt virtual machines on Kubernetes. Monorepo with a Python FastAPI backend and a React TypeScript frontend.


## GitHub Issues Workflow

Repository: `damhau/kubevmui`

### Session start
At the beginning of each conversation, run `gh issue list --repo damhau/kubevmui --limit 20` to be aware of open issues. If the user's request relates to an open issue, reference it and ask if they want to work on it.

### Bug discovery
When you discover a bug or broken behavior during work that is NOT the current task, ask the user: "I found [describe bug]. Want me to create a GitHub issue for this?" If yes, create it with the `type:bug` label, appropriate `comp:` label, and `status:needs-triage`.

### Plan to issues
When entering plan mode for a non-trivial feature or refactor, after the plan is approved, offer to create one GitHub issue per major task in the plan. Link related issues with "Related: #N" in the body. Apply appropriate type/component/priority labels.

### Working on issues
- When starting work on an existing issue, mention "Working on #N" at the start.
- ALWAYS read the content of the issue before starting to work
- Add a comment to the issue with the planned approach: `gh issue comment N --repo damhau/triaj --body "approach summary"`.
- If you hit a blocker or change approach, comment on the issue to keep a record.
- In commit messages, use `Fixes #N` (for bugs) or `Refs #N` (for partial progress) to link commits to issues.
- When work is complete, close the issue with a summary comment: `gh issue close N --repo damhau/triaj --comment "what was done"`.
- Update labels as needed (e.g. add `status:blocked` if blocked, remove when unblocked).

### Creating issues
- Before creating, check for duplicates: `gh issue list --search "keywords" --repo damhau/triaj`.
- Always apply: one `type:` label, one or more `comp:` labels, one `priority:` label.
- Use the matching template structure (bug/feature/chore fields).

### Labels reference
- **Type**: `type:bug`, `type:feature`, `type:enhancement`, `type:chore`
- **Priority**: `priority:high`, `priority:medium`, `priority:low`
- **Status**: `status:blocked`


## Repository Structure

```
backend/           # Python FastAPI API server
  app/
    api/routes/    # REST endpoint handlers
    services/      # Business logic layer
    models/        # Pydantic request/response models
    core/          # Config, K8s client, cluster manager
    auth/          # K8s token authentication
    ws/            # WebSocket proxies (VNC, serial console)
    audit/         # Audit logging
  tests/           # pytest test suite
frontend/          # React + TypeScript SPA
  src/
    pages/         # Route page components
    components/    # Reusable UI components (ui/, layout/, vm/, console/)
    stores/        # Zustand state stores
    lib/           # Utilities (api-client, theme, format)
    types/         # TypeScript type definitions
    hooks/         # Custom React hooks
kubernetes/        # K8s manifests (CRDs, RBAC)
```

## Tech Stack

- **Backend:** Python 3.12, FastAPI, Pydantic v2, kubernetes-client, uvicorn
- **Frontend:** React 19, TypeScript 5.9, Vite 8, Tailwind CSS 4, Zustand, React Query, React Router
- **Package managers:** `uv` (backend), `npm` (frontend)

## Common Commands

### Backend (run from repo root)

```bash
make backend-dev        # Dev server with hot reload (port 8000)
make backend-test       # Run tests with coverage
make backend-lint       # Ruff lint + format check
cd backend && uv run ruff format app/   # Auto-format
cd backend && uv run ruff check --fix app/  # Auto-fix lint issues
```

### Frontend (run from frontend/)

```bash
npm run dev             # Vite dev server (port 5173, proxies /api and /ws to :8000)
npm run build           # TypeScript check + production build
npm run lint            # ESLint
```

### Full Stack

```bash
make dev                # docker compose up (backend + frontend)
```

## Code Style & Conventions

### Backend
- **Formatter/Linter:** Ruff (line length 100, target Python 3.12)
- **Patterns:** Async FastAPI routes, dependency injection via `Depends()`, Pydantic models for all request/response schemas
- **Naming:** snake_case for functions/variables, PascalCase for classes/models
- **API path convention:** `/api/v1/clusters/{cluster}/namespaces/{namespace}/{resource}`

### Frontend
- **Linter:** ESLint with TypeScript + React hooks rules
- **Patterns:** React Query for server state, Zustand for UI state, axios client with `/api/v1` base
- **Path alias:** `@/*` maps to `src/*`
- **Component style:** Functional components with Tailwind CSS utility classes, class-variance-authority for variants

## Architecture Notes

- **Authentication:** Kubernetes ServiceAccount tokens validated via TokenReview API. Frontend redirects to `/login` on 401.
- **Multi-cluster:** Backend `ClusterManager` supports multiple K8s clusters via kubeconfig contexts.
- **WebSocket proxies:** VNC and serial console access via WebSocket endpoints in `backend/app/ws/`.
- **Custom CRDs:** `images.kubevmui.io` and `templates.kubevmui.io` (definitions in `kubernetes/crds/`).

## Files to Ignore

These files are large, auto-generated, or not useful for understanding the codebase. Do not read them unless specifically relevant:

- `frontend/package-lock.json` — npm lockfile (~4000 lines)
- `backend/uv.lock` — Python lockfile (~900 lines)
- `kubernetes/crds/*.yaml` — CRD schemas (auto-generated, verbose)
- `frontend/src/vite-env.d.ts` — Vite type declarations (auto-generated)

