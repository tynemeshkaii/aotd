.PHONY: push start ios android lint format typecheck install \
        db-types db-push db-new deploy-functions help

# ── Dev ──────────────────────────────────────────────────────────────────────

start:
	npm run start

ios:
	npm run ios

android:
	npm run android

# ── Code quality ─────────────────────────────────────────────────────────────

lint:
	npm run lint

format:
	npm run format

typecheck:
	npm run typecheck

check: lint typecheck

# ── Dependencies ─────────────────────────────────────────────────────────────

install:
	npm install --legacy-peer-deps

# ── Supabase ─────────────────────────────────────────────────────────────────

db-types:
	npm run db:types

db-push:
	npm run db:push

db-new:
	@read -p "Migration name: " name; npm run db:new -- $$name

deploy-functions:
	supabase functions deploy

# ── Git ───────────────────────────────────────────────────────────────────────

push:
	@if [ -z "$(m)" ]; then \
		echo "Usage: make push m=\"feat: your message\""; \
		exit 1; \
	fi
	git add -A
	git commit -m "$(m)"
	git push -u origin HEAD

# ── Help ─────────────────────────────────────────────────────────────────────

help:
	@echo ""
	@echo "  Dev"
	@echo "    make start            expo start"
	@echo "    make ios              expo start --ios"
	@echo "    make android          expo start --android"
	@echo ""
	@echo "  Code quality"
	@echo "    make lint             biome check"
	@echo "    make format           biome format --write"
	@echo "    make typecheck        tsc --noEmit"
	@echo "    make check            lint + typecheck"
	@echo ""
	@echo "  Dependencies"
	@echo "    make install          npm install --legacy-peer-deps"
	@echo ""
	@echo "  Supabase"
	@echo "    make db-types         regenerate types/database.ts"
	@echo "    make db-push          push migrations to linked project"
	@echo "    make db-new           create new migration (prompts for name)"
	@echo "    make deploy-functions deploy all edge functions"
	@echo ""
	@echo "  Git"
	@echo "    make push             stage, commit, push (auto message)"
	@echo "    make push m='...'     stage, commit, push (custom message)"
	@echo ""
