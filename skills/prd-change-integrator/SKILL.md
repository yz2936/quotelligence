---
name: prd-change-integrator
description: Use this skill when a new PRD revises or extends prior product work. It compares PRDs and existing artifacts, identifies requirement deltas, impact, obsolete assumptions, and the exact files Codex should update.
---

# PRD Change Integrator

## Mission

Protect the repository from silent requirement drift by comparing a new PRD against prior PRDs, specs, plans, and implementation assumptions.

## Use this skill when

- there is an existing PRD and a new revision arrives
- the user says “integrate this with our current PRD/specs”
- existing technical docs may be stale
- roadmap, architecture, or delivery needs to be updated based on changed requirements

## Primary responsibilities

1. Compare source documents and identify additions, deletions, modifications, and contradictions.
2. Determine which downstream artifacts are now stale.
3. Produce an impact analysis by requirement, architecture area, API surface, data model, testing, rollout, and analytics.
4. Recommend or apply precise updates instead of broad rewrites.
5. Preserve traceability between old and new requirement IDs.

## Inputs expected

- previous PRD(s)
- current or incoming PRD
- existing architecture/spec/delivery/QA docs
- codebase references when relevant

## Deliverables

1. **PRD Delta Report**
2. **Impact Matrix**
3. **Obsolete Assumptions List**
4. **Artifact Update Plan**
5. **Traceability Mapping**

## Required file outputs

Create or update:

- `/docs/product/<initiative>-prd-delta.md`
- `/docs/exec/<initiative>-decision-log.md`
- affected artifact files named in the update plan

## Comparison framework

For each changed requirement, classify as:

- added
- removed
- materially changed
- clarified only
- conflicting
- superseded

For each change, assess impact on:

- user workflow
- product scope
- APIs/interfaces
- data model
- integrations
- permissions/security
- migrations/backfill
- testing
- release plan
- metrics/instrumentation
- customer communication

## Workflow

### Step 1: Establish the baseline

State exactly which files are being compared and which one is authoritative.

### Step 2: Generate the delta

Build a table with:

- old requirement / section
- new requirement / section
- delta classification
- severity
- notes

### Step 3: Identify stale artifacts

For each existing artifact, mark:

- still valid
- valid with edits
- needs rewrite
- obsolete

### Step 4: Recommend precise updates

Do not simply say “update the spec.” Say exactly which sections require change, for example:

- architecture: event ingestion flow
- spec: quote approval API
- QA: permission matrix and rollback cases
- analytics: funnel instrumentation for new conversion step

### Step 5: Prepare the handoff

Route to the downstream skills that should update the impacted files.

## Suggested output sections

- Summary of what changed
- Change table
- Impact matrix
- Obsolete assumptions
- Files requiring updates
- Recommended execution order

## Guardrails

- Do not erase previous decisions without documenting why.
- Do not assume wording changes are harmless; assess behavioral impact.
- Preserve historical context where it affects implementation or customer commitments.
- If two PRDs conflict and authority is unclear, escalate.

## Handoff

Usually hand off to:

- `product-manager`
- `solution-architect`
- `technical-spec-writer`
- `implementation-planner`
- `qa-release-manager`
