---
name: prd-intake-orchestrator
description: Use this skill first when a new PRD or feature request arrives. It reads the PRD, extracts structured requirements, identifies unknowns, routes work to the right skills, and creates the initial artifact chain.
---

# PRD Intake Orchestrator

## Mission

Convert a raw PRD, feature brief, customer request, or founder memo into a structured execution entrypoint for Codex.

## Use this skill when

- a new PRD appears in `/incoming/prd/` or `/docs/product/`
- the user says “implement this PRD”
- the user wants architecture, specs, tickets, or delivery planning from a requirements document
- the repository contains mixed product docs and Codex needs to determine what to do next

## Primary responsibilities

1. Read the full PRD before making recommendations.
2. Identify the initiative name, status, version/date, owner, and linked artifacts.
3. Extract goals, non-goals, personas/actors, workflows, requirements, constraints, risks, dependencies, and open questions.
4. Normalize requirements into stable IDs when the source document does not already provide them.
5. Route downstream work to the right skills.
6. Create the intake artifact and execution handoff.

## Inputs expected

- raw PRD markdown, doc export, or plain text
- prior product docs when present
- existing architecture/spec/delivery docs when present
- codebase context if implementation already exists

## Deliverables

1. **PRD Intake Summary**
2. **Requirement Inventory**
3. **Open Questions and Assumptions Log**
4. **Skill Routing Plan**
5. **Artifact Creation Plan**

## Required file outputs

Create or update:

- `/docs/product/<initiative>-intake.md`
- `/docs/product/<initiative>-requirements.md`
- `/docs/exec/<initiative>-decision-log.md` if material ambiguity or strategic tradeoffs exist

## Workflow

### Step 1: Locate the source material

Look for PRDs in this order:

1. user-specified file
2. `/incoming/prd/`
3. `/docs/product/`

If multiple candidate PRDs exist, list them with dates and state which one you are treating as current.

### Step 2: Parse the document

Extract:

- title / initiative name
- date and version
- owner / stakeholders
- problem statement
- goals and non-goals
- user types / actors
- workflows or journeys
- functional requirements
- non-functional requirements
- constraints
- dependencies
- rollout notes
- metrics / success criteria
- explicit unknowns

### Step 3: Normalize requirements

If requirements are not already enumerated, create IDs such as:

- `REQ-001`
- `NFR-001`
- `MET-001`
- `DEP-001`

For each requirement include:

- ID
- source excerpt or section
- requirement statement
- rationale
- priority if inferable
- downstream owner or likely skill

### Step 4: Assess readiness

Classify the PRD:

- strategy-level only
- product-definition ready
- architecture-ready
- implementation-ready
- launch-ready

### Step 5: Route work

Recommend the next skills based on evidence:

- `product-manager` if requirements are vague or inconsistent
- `solution-architect` if technical design is needed
- `technical-spec-writer` if implementation detail is needed
- `implementation-planner` if scope is understood and sequencing is needed
- `qa-release-manager` if acceptance/testing/release planning is needed
- `growth-gtm` if messaging, launch, onboarding, or enablement is needed
- `analytics-iteration` if metrics or instrumentation are needed
- `chief-of-staff` if cross-functional synthesis is needed

## Output format for the intake file

- Document header: title, status, owner, date, source PRD
- Executive summary
- Goals and non-goals
- Actor list
- Requirement inventory
- Constraints and dependencies
- Risks and open questions
- Recommended next skills
- Files to create next

## Guardrails

- Do not invent requirements that are not grounded in the source.
- If the PRD is contradictory, preserve the contradiction and log it explicitly.
- Separate direct quotes from interpretation.
- If the PRD is too thin to support implementation, say so clearly.

## Handoff

Usually hand off to:

- `prd-change-integrator`
- `product-manager`
- `solution-architect`
