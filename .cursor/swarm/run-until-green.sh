#!/usr/bin/env bash
# Рой Cursor-агентов (model: auto) — последовательный пайплайн until-green.
#
# Использование:
#   ./.cursor/swarm/run-until-green.sh "Описание задачи"
#   SWARM_TASK="..." ./.cursor/swarm/run-until-green.sh
#   SWARM_TASK_FILE=.cursor/swarm/tasks/driver-offers.md ./.cursor/swarm/run-until-green.sh
#
# Пайплайн (5 агентов):
#   1 ux-researcher → 2 feature-architect → 3 task-implementer → 4 ux-polisher → 5 test-runner (until-green)
#
# Требования:
#   - agent (cursor-agent) в PATH (~/.local/bin)
#   - agent login (достаточно) или CURSOR_API_KEY
#   - Docker (для backend pytest)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ARTIFACTS="$REPO_ROOT/.cursor/swarm/artifacts"
LOG_DIR="$ARTIFACTS/logs"
TASK="${1:-${SWARM_TASK:-}}"
TASK_FILE="${SWARM_TASK_FILE:-}"
MAX_TEST_ROUNDS="${MAX_TEST_ROUNDS:-5}"
MODEL="${SWARM_MODEL:-auto}"

export PATH="$HOME/.local/bin:$PATH"

if [[ -n "$TASK_FILE" ]]; then
  if [[ ! -f "$REPO_ROOT/$TASK_FILE" && ! -f "$TASK_FILE" ]]; then
    echo "error: SWARM_TASK_FILE not found: $TASK_FILE" >&2
    exit 1
  fi
  TASK_FILE_PATH="$([[ -f "$TASK_FILE" ]] && echo "$TASK_FILE" || echo "$REPO_ROOT/$TASK_FILE")"
  TASK="$(cat "$TASK_FILE_PATH")"
fi

if [[ -z "$TASK" ]]; then
  echo "Usage: $0 \"<описание задачи>\"" >&2
  echo "   or: SWARM_TASK=\"...\" $0" >&2
  echo "   or: SWARM_TASK_FILE=.cursor/swarm/tasks/foo.md $0" >&2
  exit 1
fi

if ! command -v agent >/dev/null 2>&1; then
  echo "error: cursor-agent CLI not found. Install: curl https://cursor.com/install -fsS | bash" >&2
  exit 1
fi

mkdir -p "$ARTIFACTS" "$LOG_DIR"
RUN_ID="$(date +%Y%m%d-%H%M%S)"
export SWARM_TASK="$TASK"
export SWARM_RUN_ID="$RUN_ID"

log() { echo "[swarm $RUN_ID] $*"; }

run_agent_phase() {
  local phase="$1"
  local prompt="$2"
  local logfile="$LOG_DIR/${RUN_ID}-${phase}.log"

  log "▶ phase $phase (model=$MODEL)"
  agent \
    --print \
    --output-format text \
    --model "$MODEL" \
    --force \
    --trust \
    --workspace "$REPO_ROOT" \
    "$prompt" 2>&1 | tee "$logfile"

  log "✓ phase $phase done → $logfile"
}

run_backend_tests() {
  docker compose -f "$REPO_ROOT/docker-compose.test.yml" up \
    --build \
    --abort-on-container-exit \
    --exit-code-from tests 2>&1
}

run_frontend_tests() {
  (cd "$REPO_ROOT/frontend" && npx vitest run 2>&1)
}

run_frontend_build() {
  (cd "$REPO_ROOT/frontend" && npm run build 2>&1)
}

all_tests_green() {
  local logfile="$LOG_DIR/${RUN_ID}-tests-shell.log"
  {
    echo "=== backend ==="
    run_backend_tests
    echo "=== frontend vitest ==="
    run_frontend_tests
    echo "=== frontend build ==="
    run_frontend_build
  } 2>&1 | tee "$logfile"
}

log "task: $TASK"
log "artifacts: $ARTIFACTS"

# ── Agent 1: UX/UI research ──────────────────────────────────────────────────
run_agent_phase "1-ux-research" "$(cat <<EOF
Используй субагента **ux-researcher**.

Собери максимально полный UX/UI контекст приложения lithcar: правила, токены, паттерны компонентов, user flows (пассажир / водитель / админ), карта, формы.

Обязательно сохрани результат в файл:
  .cursor/swarm/artifacts/ux-context.md

Не пиши код — только исследование и документ.
EOF
)"

# ── Agent 2: Feature architecture ────────────────────────────────────────────
run_agent_phase "2-architect" "$(cat <<EOF
Используй субагента **feature-architect**.

## Задача
$TASK

## Контекст
Прочитай .cursor/swarm/artifacts/ux-context.md.
Исследуй кодовую базу и составь детальную техспеку.

Сохрани в .cursor/swarm/artifacts/feature-spec.md
Не пиши код — только спецификация.
EOF
)"

# ── Agent 3: Implementation ──────────────────────────────────────────────────
run_agent_phase "3-implement" "$(cat <<EOF
Используй субагента **task-implementer**.

## Задача
$TASK

## Контекст (обязательно прочитай оба файла)
- .cursor/swarm/artifacts/ux-context.md
- .cursor/swarm/artifacts/feature-spec.md

Реализуй строго по feature-spec.md. Сохрани заметки в .cursor/swarm/artifacts/implementation-notes.md
EOF
)"

# ── Agent 4: UX polish ───────────────────────────────────────────────────────
run_agent_phase "4-ux-polish" "$(cat <<EOF
Используй субагента **ux-polisher**.

Проверь все UI-изменения по задаче:
  $TASK

Сверь с .cursor/swarm/artifacts/ux-context.md и исправь расхождения (отступы, токены, радиусы, паттерны).

Сохрани отчёт в .cursor/swarm/artifacts/ux-review.md
EOF
)"

# ── Agent 5: Tests until green ───────────────────────────────────────────────
log "▶ phase 5-test (until-green, max $MAX_TEST_ROUNDS rounds)"

round=1
while true; do
  log "test round $round/$MAX_TEST_ROUNDS"

  if all_tests_green; then
    log "✓ all tests GREEN"
    echo "GREEN" > "$ARTIFACTS/test-status.txt"
    break
  fi

  if [[ "$round" -ge "$MAX_TEST_ROUNDS" ]]; then
    log "✗ max rounds reached, tests still failing"
    echo "RED" > "$ARTIFACTS/test-status.txt"
    exit 1
  fi

  run_agent_phase "5-test-fix-r${round}" "$(cat <<EOF
Используй субагента **test-runner**.

Тесты упали на раунде $round. Прочитай вывод в:
  .cursor/swarm/artifacts/logs/${RUN_ID}-tests-shell.log

Задача: $TASK

Исправь падения в scope задачи. Запусти тесты сам и добейся GREEN.
Запиши отчёт в .cursor/swarm/artifacts/test-report.md
EOF
)"

  round=$((round + 1))
done

log "════════════════════════════════════════"
log "SWARM COMPLETE — GREEN"
log "artifacts:"
log "  ux-context.md"
log "  feature-spec.md"
log "  implementation-notes.md"
log "  ux-review.md"
log "  test-report.md (если были фиксы)"
log "  logs/${RUN_ID}-*.log"
log "════════════════════════════════════════"
