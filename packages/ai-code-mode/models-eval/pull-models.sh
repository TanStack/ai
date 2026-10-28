#!/usr/bin/env bash
# Pull Ollama models used by models-eval (strong tool-calling / coding across sizes).
set -euo pipefail

MODELS=(
  "gpt-oss:20b"
  "nemotron-cascade-2"
)

for model in "${MODELS[@]}"; do
  echo "--- Pulling $model ---"
  ollama pull "$model"
done

echo "Done."
