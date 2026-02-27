#!/usr/bin/env bash
#
# lair404 E2E Test Runner — 5-phase orchestration
#
# Usage: bash run-e2e-lair404.sh [phase]
#   phase: 1-5 or "all" (default: all)
#
# Runs on lair404 against localhost services.
# Prerequisite: .env.lair404.e2e must exist (copy from .env.lair404.e2e.example)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Load env
if [[ -f .env.lair404.e2e ]]; then
  set -a
  source .env.lair404.e2e
  set +a
  echo "[env] Loaded .env.lair404.e2e"
else
  echo "[warn] .env.lair404.e2e not found — using environment variables"
fi

PHASE="${1:-all}"
FAILED=0
TOTAL=0
PASSED=0

run_phase() {
  local phase_num="$1"
  local label="$2"
  local cmd="$3"

  echo ""
  echo "══════════════════════════════════════════════════════════════"
  echo "  Phase ${phase_num}: ${label}"
  echo "══════════════════════════════════════════════════════════════"

  TOTAL=$((TOTAL + 1))

  if eval "$cmd"; then
    PASSED=$((PASSED + 1))
    echo "  ✓ Phase ${phase_num} PASSED"
  else
    FAILED=$((FAILED + 1))
    echo "  ✗ Phase ${phase_num} FAILED"

    # Phase 1 is a gate — abort if health checks fail
    if [[ "$phase_num" == "1" ]]; then
      echo ""
      echo "  ⚠ Phase 1 (Health) failed — aborting remaining phases."
      echo "  Fix service issues before running tests."
      exit 1
    fi
  fi
}

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║           lair404 E2E Test Suite                            ║"
echo "║           Mail-Zero + Google Workspace                      ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Target: ${FRONTEND_URL:-http://127.0.0.1:3050}"
echo "Time:   $(date '+%Y-%m-%d %H:%M:%S')"

# Phase 1: Health Endpoints
if [[ "$PHASE" == "all" || "$PHASE" == "1" ]]; then
  run_phase 1 "Health Endpoints" \
    "node --test api/health-endpoints.test.mjs"
fi

# Phase 2: MCP Protocol
if [[ "$PHASE" == "all" || "$PHASE" == "2" ]]; then
  run_phase 2a "MCP Email (SSE)" \
    "node --test api/mcp-email.test.mjs"
  run_phase 2b "MCP Google Workspace (HTTP)" \
    "node --test api/mcp-gws.test.mjs"
fi

# Phase 3: LiteLLM Routing
if [[ "$PHASE" == "all" || "$PHASE" == "3" ]]; then
  run_phase 3 "LiteLLM Routing" \
    "node --test api/litellm-routing.test.mjs"
fi

# Phase 4: Langfuse Traces
if [[ "$PHASE" == "all" || "$PHASE" == "4" ]]; then
  run_phase 4 "Langfuse Traces" \
    "node --test api/langfuse-traces.test.mjs"
fi

# Phase 5: Playwright Browser Tests
if [[ "$PHASE" == "all" || "$PHASE" == "5" ]]; then
  run_phase 5 "Playwright Browser Tests" \
    "npx playwright test --config playwright.lair404.config.ts"
fi

# Summary
echo ""
echo "══════════════════════════════════════════════════════════════"
echo "  SUMMARY"
echo "══════════════════════════════════════════════════════════════"
echo "  Total:  ${TOTAL}"
echo "  Passed: ${PASSED}"
echo "  Failed: ${FAILED}"
echo ""

if [[ "$FAILED" -gt 0 ]]; then
  echo "  ⚠ ${FAILED} phase(s) failed"
  exit 1
else
  echo "  ✓ All phases passed!"
  exit 0
fi
