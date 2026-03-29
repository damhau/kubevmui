# CLAUDE.md

## Project Overview

KubeVM UI — a full-stack web application for managing KubeVirt virtual machines on Kubernetes. Monorepo with a Python FastAPI backend and a React TypeScript frontend.

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

