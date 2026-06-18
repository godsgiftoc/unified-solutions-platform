.DEFAULT_GOAL := help
COMPOSE := docker compose -f infra/docker-compose.yml --env-file .env

.PHONY: help up down logs backend worker frontend initdb migrate revision seed test fmt

help: ## Show this help
	@grep -hE '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

up: ## Start backing services (postgres, redis, minio)
	$(COMPOSE) up -d

down: ## Stop backing services
	$(COMPOSE) down

logs: ## Tail backing-service logs
	$(COMPOSE) logs -f

backend: ## Run the FastAPI dev server
	cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

worker: ## Run the Arq worker
	cd backend && arq app.ingestion.worker.WorkerSettings

frontend: ## Run the Vite dev server
	cd frontend && npm run dev

initdb: ## Create tables directly from models (P0 quick bootstrap)
	cd backend && python -m app.scripts.init_db

migrate: ## Apply Alembic migrations
	cd backend && alembic upgrade head

revision: ## Autogenerate a migration: make revision m="message"
	cd backend && alembic revision --autogenerate -m "$(m)"

seed: ## Seed a dev org/workspace/user
	cd backend && python -m app.scripts.seed

test: ## Run backend tests
	cd backend && pytest -q

fmt: ## Format + lint backend
	cd backend && ruff check --fix . && ruff format .
