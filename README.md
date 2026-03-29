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

## Vercel Deployment

This project can be deployed to Vercel with:

- static app files served from the repo root
- a catch-all Node serverless function at `/api/[...path].js`

### Required environment variables

- `OPENAI_API_KEY`
- `DATABASE_URL`

`PORT` is only used for local development. Vercel ignores it.

### Persistence behavior

- If `DATABASE_URL` is set, [`server/store.js`](./server/store.js) uses Postgres and creates the required `cases` and `knowledge_files` tables automatically.
- If `DATABASE_URL` is not set, the app falls back to the local JSON file store under `/tmp` for development only.

For Vercel or any real deployment, set `DATABASE_URL`. Without it, uploads and generated state can still disappear across cold starts, instance changes, or deployments.

### Vercel setup steps

1. Import the GitHub repository into Vercel.
2. Leave the framework preset as `Other`.
3. Do not set a build command.
4. Add the `OPENAI_API_KEY` and `DATABASE_URL` environment variables in the Vercel project settings.
5. Deploy.

### Recommended database

Use a hosted Postgres database, for example Vercel Postgres, Neon, Supabase, or another provider that gives you a standard Postgres connection string.
