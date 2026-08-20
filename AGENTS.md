# SUOWANG Project Contract

This file is the execution contract for `A:/2Workspace/Projects/suowang`.
It is intentionally versioned and should be committed and pushed with the repository.
It must never contain private life data, credentials, tokens, machine-specific secrets, or hidden instructions for consequential actions.

## Product identity

- Brand: **所往 SUOWANG**
- Slogan: **行有所往。**
- Category: **人生主线导航器** / **Visual Mainline Navigator for Life**
- Philosophy: **知所往 · 择其径 · 行其事**
- Core concept: **主线 / Mainline**
- Product promise: when the user's cognitive capacity is low, the product makes direction clear within three seconds and the next useful action clear within ten seconds.

The slogan is a product contract, not decoration. Every meaningful interaction should help the user see where they are going or take one useful step in that direction.

## Mission

SUOWANG is a stable external cognitive interface. It answers three questions with minimal thought:

1. Where am I now?
2. Which direction am I taking?
3. What is the next useful action?

It is not a Todo List, goal-management suite, project-management dashboard, RPG system, KPI cockpit, or AI chat product.

## Product philosophy

### 知所往

Show the user's current state, constraints, and a small set of genuinely different future paths. Keep observed facts, user-entered facts, and inference distinct.

### 择其径

Exactly one path may be the current mainline. A candidate path must describe its benefit, completion evidence, time horizon, and cost. If every path can be pursued fully at once, they are categories rather than choices.

Exploration must remain low-cost. Opening or inspecting a path must never activate it. Activation requires an explicit, clearly labeled user decision.

### 行其事

Compress the current mainline into a narrative timeline and one useful action now. When energy is low, reduce the action's resolution while preserving direction.

The loop is:

```text
know reality -> choose a mainline -> act on the next step
     ^                                      |
     +----------- reality changes <---------+
```

## Stable interface contract

Information may change; primary spatial relationships should remain stable so repeated use creates spatial memory.

The mainline surface has four persistent layers:

1. A road and horizon showing three candidate future paths.
2. A concise summary of the active mainline.
3. A narrative timeline for today, this week, this month, and later.
4. A fixed `现在最值得做` card that all planning converges on.

On desktop, a stable left rail anchors the product brand and primary navigation. On narrow screens, it collapses into a compact top bar without changing the mainline reading order.

The road is a functional navigation component, not background decoration. The active path is visually strongest; alternatives remain visible but quieter.

The early visual reference at `docs/assets/early-mainline-concept.png` establishes direction only. It is not implementation evidence. Its left rail is an intentional spatial anchor; placeholder branding, notification systems, membership badges, broad task management, and decorative complexity are not requirements.

## Path contract

Each path should support these fields:

- `title`: short route name
- `one_liner`: plain-language description
- `status`: `candidate`, `recommended`, `active`, `reviewing`, `complete`, or `paused`
- `reason`: why this path matters now
- `success`: observable completion evidence
- `cost`: what will be paused, reduced, or declined
- `horizon`: expected duration
- `timeline`: narrative milestones from now to later
- `confidence`: optional confidence in a recommendation, never a substitute for user judgment

State transitions are explicit:

```text
candidate -> recommended -> active -> reviewing -> complete
                                               \-> paused
```

Dates do not switch a mainline automatically. A review moment may invite reassessment; the user makes the consequential decision.

## Narrative timeline contract

- Today: one to three concrete actions.
- This week: no more than three meaningful nodes.
- This month: outcome-oriented milestones.
- Later: broad direction and review points, not detailed tasks.
- Near-term items are concrete; distant items are intentionally abstract.
- Do not introduce a Gantt chart, Jira-like board, or fake scheduling precision into the mainline surface.

## NOW contract

`现在最值得做` is the terminal point of the page, not a secondary widget. It includes:

- one concrete action
- expected duration
- required energy or cognitive load
- an observable completion definition
- a lower-energy fallback
- optionally an ultra-low-energy first move

Fallbacks reduce scope without changing direction. They must not disguise inactivity as completion.

## AI contract

AI stays behind the stable interface. The default product surface has no chat box.

Permitted early AI entry points are deliberately narrow:

1. Reassess the three candidate paths.
2. Explain why a path is recommended.
3. Replan the narrative timeline after reality changes.
4. Adjust the next useful action when the user is stuck.

AI proposes structured state; it does not silently activate paths, rewrite personal facts, claim that work happened, or make consequential decisions.

Use this mental model:

```text
AI is the compiler.
The stable UI is the compiled artifact.
```

## Versioning and history

Mainline decisions are naturally versioned. A historical record should preserve:

- the active path at that time
- the candidate paths considered
- why the path was chosen
- its timeline and completion evidence
- observed outcomes
- why it was completed, paused, or replaced

History must distinguish what was planned from what actually happened. Never turn a recommendation, scheduled item, opened screen, or elapsed date into evidence of completion.

## V0.1 boundary

V0.1 may include:

- road and horizon visual
- exactly three visible future paths
- path details and explicit activation
- current-mainline summary
- narrative timeline
- NOW card with fallback action
- lightweight manual state adjustment
- local persistence
- historical versions
- one reassessment entry point for AI, which may initially be stubbed or omitted

V0.1 must not include:

- real private life data in the repository
- automatic decisions or silent mainline switching
- background monitoring or notifications
- platform infrastructure unrelated to V0.1 navigation
- large dashboards, domain scorecards, RPG attributes, or engagement loops
- coupling to a legacy repository, runtime, Skill, or private data store

The visual prototype was migrated from an implementation donor. Only reviewed pieces that satisfy this contract belong here; legacy naming, unused assets, notification controls, membership badges, and unrelated architecture stay outside this repository.

## Current source layout

- `index.html`: semantic application shell and stable mainline surface.
- `src/styles.css`: responsive visual system and road-scene presentation.
- `src/app.js`: demo paths, explicit activation, history, editing, and browser-local persistence.
- `assets/mainline-scene-*-v1.webp`: locked road master and three route-highlight states.
- `scripts/serve.mjs`: dependency-free local server and health endpoint.
- `scripts/start.ps1`: double-click Windows entrypoint.
- `tests/`: repeatable state and server contracts.
- `docs/visual-contract.md`: visual boundaries derived from the early concept.

Run from `A:/2Workspace/Projects/suowang`:

```powershell
npm test
npm run check
npm start
```

The local URL is `http://127.0.0.1:2037/`; health is `http://127.0.0.1:2037/health`.

## Accessibility and interaction quality

- The primary surface must remain usable at 320px width.
- All core decisions must be keyboard accessible.
- Reduced-motion preferences must be honored.
- Important state cannot depend on color alone.
- Focus, hover, selected, recommended, active, and disabled states must remain distinguishable.
- Visual polish must not reduce text contrast or obscure the road-to-action hierarchy.

## Repository and data boundaries

- This repository is a new independent project at `A:/2Workspace/Projects/suowang`.
- Do not treat similarly named legacy folders, Skills, junctions, or private data stores as project truth.
- Mutable runtime state, personal data, logs, exports, screenshots with private content, credentials, and local caches do not belong in Git.
- If durable private runtime data is introduced later, place it outside the repository and document the boundary before implementation.
- Do not introduce an external API, database, deployment target, analytics service, or telemetry without explicit user direction and a documented privacy impact.

## Change discipline

- Inspect the repository state before editing and preserve unrelated user changes.
- Deliver one user-visible, independently reversible slice at a time.
- Add repeatable tests for stable behavior.
- UI changes require real desktop and 320px browser verification.
- State-changing behavior requires tests for explicit consent, history, and failure recovery.
- Prefer plain data contracts and low dependency count during V0.1.
- Use English for code, filenames, commands, variables, and commit messages. User-facing copy is Simplified Chinese.
- Do not claim a feature, route, persistence layer, AI integration, or accessibility result exists until it has been implemented and verified.
- Local commits and explicitly requested private remote pushes are allowed. Public release remains a separate user decision.

## Product admission test

Before adding a feature, answer:

> Does this make “我现在在哪、我要去哪、现在干什么” clearer?

If the answer is no, it does not belong on the mainline surface.

The highest-priority design rule is:

> **当用户认知能力只剩 30% 时，这个页面仍然必须很好用。**
