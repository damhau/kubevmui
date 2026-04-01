.PHONY: dev backend-dev backend-test backend-lint

## dev: Start all services with Docker Compose
dev:
	docker compose up

## backend-dev: Run the backend in development mode with live reload
backend-dev:
	cd backend && KUBEVMUI_KUBECONFIG_PATH=/home/damien/.kube/redboxdha uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

## backend-test: Run backend tests with coverage
backend-test:
	cd backend && uv run pytest --cov=app --cov-report=term-missing

## backend-lint: Run ruff linter and formatter check on backend source
backend-lint:
	cd backend && uv run ruff check app/
	cd backend && uv run ruff format --check app/
