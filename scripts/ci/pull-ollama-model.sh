#!/usr/bin/env bash
set -euo pipefail

OLLAMA_URL="${NEXO_MODEL_EVAL_URL:-http://127.0.0.1:11434}"
MODEL="${NEXO_MODEL_EVAL_MODEL:-qwen3:4b}"

echo "Waiting for Ollama at ${OLLAMA_URL}..."

for attempt in $(seq 1 60); do
  if curl --fail --silent "${OLLAMA_URL}/api/tags" >/dev/null; then
    break
  fi

  if [ "$attempt" -eq 60 ]; then
    echo "Ollama did not become ready."
    exit 1
  fi

  sleep 1
done

payload="$(jq -nc --arg name "$MODEL" '{name:$name,stream:false}')"

curl \
  --fail \
  --show-error \
  --silent \
  "${OLLAMA_URL}/api/pull" \
  -H 'Content-Type: application/json' \
  --data "$payload"

echo
echo "Validating model availability..."

models="$(curl --fail --silent "${OLLAMA_URL}/api/tags")"

echo "$models" | jq -e \
  --arg model "$MODEL" \
  '.models | any(.name == $model or .model == $model)' \
  >/dev/null

echo "Model $MODEL is available."
