# Filename: Makefile
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

.DEFAULT_GOAL := help
PNPM := corepack pnpm

LOG := $(HOME)/.config/mind/logs/mind.log

.PHONY: help install dev logs check test e2e package verify-deb install-deb clean

help: ## Show the available commands
	@grep -E '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  \033[35m%-12s\033[0m %s\n", $$1, $$2}'

install: ## Install the dependencies
	$(PNPM) install

dev: ## Run the app with hot reload
	$(PNPM) dev

logs: ## Follow the app log (~/.config/mind/logs/mind.log), also written when opened from the menu
	@mkdir -p $(dir $(LOG)) && touch $(LOG) && tail -n 100 -f $(LOG)

check: ## Lint, formatting, types and unit tests with coverage
	$(PNPM) lint && $(PNPM) format:check && $(PNPM) typecheck && $(PNPM) test --coverage

test: ## Unit tests only
	$(PNPM) test

e2e: ## End-to-end tests (Playwright driving Electron; needs a display or xvfb)
	xvfb-run -a $(PNPM) e2e

package: ## Build the .deb in dist/
	$(PNPM) package

verify-deb: ## Check the .deb (metadata, contents, size limits, lintian)
	scripts/verify-deb.sh

install-deb: package ## Build and install the .deb on this machine
	sudo apt install -y ./dist/mind_amd64.deb

clean: ## Remove build output
	rm -rf out dist coverage test-results
