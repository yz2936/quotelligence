# AI Product Company Operating System

Codex should treat this repository as a persistent multi-agent workspace for turning PRDs into execution-ready artifacts and implementation work.

## Instruction priority

1. `AGENTS.md` defines the default operating model.
2. Skills in `/skills/*/SKILL.md` define specialized workflows.
3. Product artifacts in `/docs/` and incoming PRDs in `/incoming/prd/` are source-of-truth inputs for execution.
4. If a new PRD conflicts with an older artifact, do not silently overwrite assumptions. Write a delta analysis first, then propose or apply updates.

## Core operating rules

1. Do not jump from idea to build without validation unless the PRD explicitly states the decision has already been made.
2. Separate **facts**, **assumptions**, **inferences**, **open questions**, and **recommendations**.
3. Every requirement should have a stable ID where practical, such as `REQ-001`.
4. Every material artifact should link back to its source PRD and version/date.
5. When a PRD is present, start by reading it before planning work.
6. If the request is to “implement the PRD,” first create or refresh the execution chain: intake, architecture, technical spec, plan, QA/release, analytics.
7. If the repository already contains prior PRDs, specs, or implementation artifacts, compare the new PRD against them before editing.
8. Do not collapse unresolved ambiguity into fake certainty. Create an explicit assumptions or questions section instead.

## PRD-first workflow

When a PRD exists in `/incoming/prd/`, `/docs/product/`, or is explicitly mentioned by the user, use this default sequence:

1. Run `prd-intake-orchestrator` to extract goals, requirements, risks, dependencies, unknowns, and routing.
2. If this PRD updates prior work, run `prd-change-integrator` to produce a change-impact analysis.
3. Run `product-manager` to normalize requirements into a clean PRD or feature brief if needed.
4. Run `solution-architect` and `technical-spec-writer` to produce architecture and implementation-grade specs.
5. Run `implementation-planner` to create milestones, tickets, sequencing, and dependency mapping.
6. Run `qa-release-manager` to create test strategy, release plan, rollback plan, and acceptance checklist.
7. Run `growth-gtm` and `analytics-iteration` if the PRD affects launch, adoption, pricing, or telemetry.
8. Run `chief-of-staff` when leadership needs a decision memo or cross-functional synthesis.

## Required outputs for a new or changed PRD

At minimum, Codex should create or update:

- `/docs/product/<initiative>-intake.md`
- `/docs/product/<initiative>-requirements.md`
- `/docs/architecture/<initiative>-architecture.md`
- `/docs/specs/<initiative>-technical-spec.md`
- `/docs/delivery/<initiative>-implementation-plan.md`
- `/docs/delivery/<initiative>-qa-release.md`
- `/docs/analytics/<initiative>-instrumentation.md`
- `/docs/exec/<initiative>-decision-log.md`

If some files are not needed, explain why.

## Artifact standards

Every substantial output should be written into a file with a clear title, date, owner, status, linked PRD, and next step.

Recommended directories:
- `/incoming/prd/` for raw user-provided PRDs
- `/docs/market/`
- `/docs/discovery/`
- `/docs/strategy/`
- `/docs/product/`
- `/docs/architecture/`
- `/docs/specs/`
- `/docs/delivery/`
- `/docs/gtm/`
- `/docs/analytics/`
- `/docs/exec/`

## Decision log format

For any non-trivial recommendation, include:

- **Decision statement**
- **Context**
- **Source PRD(s)**
- **Options considered**
- **Decision criteria**
- **Recommendation**
- **Risks**
- **Follow-up actions**

## Handoff protocol

When one skill finishes and another should continue, produce a concise handoff containing:

- objective
- source PRD and version
- state of work completed
- key assumptions
- unresolved questions
- files created or updated
- recommended next skill

## Review bar

Before finalizing a major artifact, self-check:

- Did I read the relevant PRD(s)?
- Is every major recommendation traceable to a requirement, assumption, or explicit tradeoff?
- Are scope, dependencies, and risks sharp enough for execution?
- Could engineering, design, GTM, and leadership all use this artifact without another meeting?

## Verification commands

Useful validation prompts for Codex:

- `Summarize the active instructions and skills relevant to this PRD.`
- `Read the PRD in /incoming/prd and produce the required output chain.`
- `Compare this PRD to existing specs and update only what changed.`
- `Generate a requirement traceability matrix from the PRD to spec and test plan.`

## Default collaboration patterns

Use these pairings frequently:

- `prd-intake-orchestrator` + `prd-change-integrator`
- `market-intelligence` + `customer-discovery`
- `product-strategist` + `product-manager`
- `solution-architect` + `technical-spec-writer`
- `implementation-planner` + `qa-release-manager`
- `growth-gtm` + `analytics-iteration`
- `chief-of-staff` to synthesize cross-functional output into executive decisions
