"""E1 — Harbor adapter for the TanStack AI context-optimization agent.

Modeled on Harbor's ``langgraph.py`` + ``langgraphjs_runner.mjs`` precedent: a
Python adapter that installs Node and the pinned ``@tanstack/ai`` packages into
the task container, uploads ``tanstack_ai_runner.mjs``, runs the agent, and
reports usage (including cache tokens) back into the Harbor trajectory the same
way ``strands_runner.py`` does.

Harbor is Apache-2.0. Adopting its runner buys direct comparability with the
Strands numbers.

NOTE: the exact ``BaseInstalledAgent`` method names / return shapes depend on
the Harbor version you pin. Points that must be checked against that version are
marked ``TODO(harbor)``. The Node runner (``tanstack_ai_runner.mjs``) is the
source of truth for the agent behavior and the per-trial record shape.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path

try:
    # TODO(harbor): import path for the installed-agent base class in your pin.
    from harbor.agents import BaseInstalledAgent  # type: ignore
except Exception:  # pragma: no cover - lets this file import without Harbor present
    class BaseInstalledAgent:  # minimal stand-in for type-checking / docs
        pass


RUNNER = "tanstack_ai_runner.mjs"
# Pin these to the exact versions whose numbers you publish (brief §7: "every
# number names its implementation — language, package, version").
PINNED_PACKAGES = [
    "@tanstack/ai@<pin>",
    "@tanstack/ai-optimize@<pin>",
    "@tanstack/ai-anthropic@<pin>",
    "@tanstack/ai-openai@<pin>",
]


@dataclass
class ArmConfig:
    arm: str  # baseline | global | adorned | universal
    model: str
    turn_limit: int = 30


class TanStackAIAgent(BaseInstalledAgent):
    """Runs the TanStack AI agent for one arm/model inside a Harbor task container."""

    def __init__(self, arm: str, model: str, turn_limit: int = 30) -> None:
        self.cfg = ArmConfig(arm=arm, model=model, turn_limit=turn_limit)

    # --- container provisioning ------------------------------------------------
    def install(self, container) -> None:
        """Install Node + pinned packages and upload the runner."""
        # TODO(harbor): use Harbor's container exec/upload API for your pin.
        container.exec(["bash", "-lc", "node --version || (curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && apt-get install -y nodejs)"])
        container.exec(["bash", "-lc", "mkdir -p /agent"])
        container.upload(str(Path(__file__).with_name(RUNNER)), f"/agent/{RUNNER}")
        container.upload(str(Path(__file__).with_name("arms.mjs")), "/agent/arms.mjs")
        container.upload(str(Path(__file__).with_name("tools.mjs")), "/agent/tools.mjs")
        container.exec(["bash", "-lc", f"cd /agent && npm init -y >/dev/null 2>&1 && npm install {' '.join(PINNED_PACKAGES)}"])

    # --- the run ---------------------------------------------------------------
    def run(self, container, task) -> dict:
        """Run one task and return a trajectory dict Harbor converts."""
        task_json = json.dumps(self._task_payload(task))
        env = {
            "ARM": self.cfg.arm,
            "MODEL": self.cfg.model,
            "TURN_LIMIT": str(self.cfg.turn_limit),
            # Provider keys are injected by Harbor's secret mechanism.
            "ANTHROPIC_API_KEY": os.environ.get("ANTHROPIC_API_KEY", ""),
            "OPENAI_API_KEY": os.environ.get("OPENAI_API_KEY", ""),
        }
        # Write the task file, run the runner, capture its single JSONL line.
        container.exec(["bash", "-lc", f"cat > /agent/task.json <<'EOF'\n{task_json}\nEOF"])
        result = container.exec(
            ["bash", "-lc", f"cd /agent && node {RUNNER} --smoke task.json"],
            env=env,
        )
        record = json.loads(result.stdout.strip().splitlines()[-1])
        return self._to_trajectory(record)

    # --- mapping helpers -------------------------------------------------------
    def _task_payload(self, task) -> dict:
        # TODO(harbor): map Harbor's task object to the runner's task shape
        # ({ id, suite, prompt, cwd, answer }). For Terminal-Bench 2.1 the
        # prompt + working dir come from the task; `answer` may be absent (Harbor
        # grades via its own checker instead of the runner's `classify`).
        return {
            "id": getattr(task, "id", "task"),
            "suite": getattr(task, "suite", "terminal-bench"),
            "prompt": getattr(task, "instruction", getattr(task, "prompt", "")),
            "cwd": getattr(task, "workdir", "/workspace"),
            "answer": getattr(task, "answer", None),
        }

    def _to_trajectory(self, record: dict) -> dict:
        # Report usage incl. cache tokens into the Harbor context, mirroring how
        # strands_runner.py surfaces usage. Harbor reads these for its cost math;
        # our report.mjs is the independent cross-check.
        return {
            "outcome": record["outcome"],
            "usage": {
                "input_tokens": record["tokens"]["input"],
                "output_tokens": record["tokens"]["output"],
                "cache_read_tokens": record["tokens"]["cache_read"],
                "cache_write_tokens": record["tokens"]["cache_write"],
            },
            "steps": record["tokens"]["steps"],
            "metadata": {
                "arm": record["arm"],
                "model": record["model"],
                "implementation": record["implementation"],
                "failure_class": record.get("failureClass"),
                "truncation": record.get("truncation"),
            },
        }
