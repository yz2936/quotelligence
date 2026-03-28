# AI Agent Team for Codex

Codex-ready multi-agent operating system for turning PRDs into decision-grade and execution-grade work.

## What this package is for

Use this when you want Codex to:

- read new PRDs
- compare them against prior PRDs or specs
- write product and technical artifacts
- break work into milestones and delivery plans
- produce QA, launch, analytics, and executive decision outputs

## Recommended repo layout

```text
.
├── AGENTS.md
├── incoming/
│   └── prd/
├── docs/
│   ├── product/
│   ├── architecture/
│   ├── specs/
│   ├── delivery/
│   ├── gtm/
│   ├── analytics/
│   └── exec/
└── skills/
```

## How to use with Codex

1. Put this folder at the root of your repo.
2. Drop raw PRDs into `/incoming/prd/` or keep canonical PRDs in `/docs/product/`.
3. Ask Codex to read the PRD and execute the workflow.

Example prompts:

- `Read the PRD in /incoming/prd and create the full artifact chain.`
- `Use the PRD change integrator to compare the new PRD to our existing docs and update the specs.`
- `Turn this PRD into architecture, technical spec, implementation plan, and QA plan.`

## Important skills for PRD-driven work

- `prd-intake-orchestrator`
- `prd-change-integrator`
- `product-manager`
- `solution-architect`
- `technical-spec-writer`
- `implementation-planner`
- `qa-release-manager`

## Notes

Codex reads `AGENTS.md` before doing work, and skills package reusable workflows with instructions and optional scripts/resources. Keep `AGENTS.md` at repo root and the skills under `/skills`.
