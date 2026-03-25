# ADW Workflow Architecture: Comparison of Approaches

**Date:** 2026-03-22
**Context:** Post-standardization (PRD v2.0 remediation complete). 13 workflows, two-tier architecture (runStep composites + direct step function workflows), shared abstraction layer in adws/src/.

## At a Glance

| Concern | Current (Imperative) | XState | Convex Workflows | Effect.ts | Modular Composition |
|---------|---------------------|--------|-------------------|-----------|---------------------|
| Retry logic | Manual loops | Explicit transitions | Built-in | `Schedule` combinators | Per-module, duplicated |
| Error typing | `success: boolean` | Transition guards | Try/catch | Typed error channel | Same as current |
| Testability | Hard (real env vars, real GitHub) | Same | Same | DI via Layers | Slightly better (isolated modules) |
| Composability | `runStep()` | Machine composition | Step chaining | `pipe`/`gen` | Workflow-as-step |
| Learning curve | Low | Medium | Low | High | Low |
| Migration cost | N/A | Medium | High (infra) | High (rewrite) | Medium |
| Observability | Log files | State visualization | Dashboard | Built-in tracing | Log files per module |
| Durability | None (local process) | None | Full (survives crashes) | None | None |
| Multi-user / remote trigger | No | No | Yes | No | No |
| Concurrency control | Manual | Concurrent regions | Per-document serialization | Structured concurrency | Manual |

---

## 1. Current Approach (Imperative Async)

The system uses two tiers: simple sequential workflows use `runStep()` for full boilerplate encapsulation; complex workflows (retry loops, parallelism, state management) use `taggedLogger()` + direct step functions. Both tiers share `agent-sdk.ts`, `utils.ts`, `logger.ts`.

### Strengths
- Simple data flow via local variables (e.g. `planPath` passed directly to build step)
- Unified error handling — one try/catch, one `commentFinalStatus` per workflow
- Single-pass usage reporting via `allStepUsages[]`
- Low cognitive overhead — anyone who knows TypeScript + async/await can read it
- Tier-1 composites are very concise (~100 lines)

### Weaknesses
- No typed errors — `QueryResult.success: boolean` doesn't tell you *what* failed
- Untestable without real side effects (GitHub, git, filesystem)
- No durability — machine sleep or crash loses everything
- Retry logic is hand-rolled and verbose (~100 lines in adw_test.ts)

### When to keep it
Stable set of prescriptive workflows, solo developer, local execution, workflows complete in minutes.

---

## 2. Modular Composition (Atomic Workflows as Building Blocks)

Each command (plan, build, test, review, document) becomes a fully self-contained workflow with its own state, git ops, logging, and error handling. Composites orchestrate these atomic workflows instead of calling step functions directly.

### Strengths
- Each atomic workflow is independently runnable and testable
- Eliminates the Tier-1/Tier-2 split — composites become trivial orchestrators
- Reduces combinatorial explosion when adding new commands
- State handoff between steps becomes explicit (via ADWState or stdout)
- Partial completion is meaningful — each step commits its own work
- Independent retryability — re-run just the failed step

### Weaknesses
- Overhead per step: each atomic workflow initializes logger, loads state, checks out branch, commits, possibly updates PR — multiplied by N steps in a composite
- Inter-step data flow gets harder — local variables become serialization/deserialization boundaries
- Distributed error handling: who owns reporting? Atomic workflow posts its own failure comment, then orchestrator posts a summary — duplicate noise
- Policy ownership problem: `onFail: "continue"` is a composite-level decision, but the atomic workflow doesn't know whether it's standalone or composed
- Forces a "sub-workflow mode" flag to suppress git/PR ops when composed — re-introducing the complexity it aimed to eliminate

### When it makes sense
Dynamic pipeline definitions — when a user or config file specifies step sequences at runtime and you can't pre-write every permutation. The coordination overhead stops being overhead and becomes the feature.

### Decision boundary
**Static pipelines (you decide which combinations exist) → current approach is better.
Dynamic pipelines (runtime-configurable step sequences) → modular composition becomes necessary.**

---

## 3. XState (State Machines)

Model each workflow as an explicit state machine with named states, transitions, guards, and actions.

### Strengths
- Makes implicit control flow explicit and visualizable — `adw_review.ts` has ~5 states that are currently encoded as loop variables and conditionals
- Forces exhaustive handling of every transition — can't forget an edge case
- The SDLC workflow's `onFail: "continue"` becomes a visible transition (`test_failed → review`) rather than a buried parameter
- XState tooling generates diagrams of state graphs — useful for onboarding and debugging

### Weaknesses
- Tier-1 workflows are linear (plan → build → done) — modeling as a state machine adds ceremony for zero benefit
- 95% of workflow code is side effects (prompt building, result parsing, comment posting), which lives in XState's `actions`/`services` — the machine orchestrates them but doesn't simplify them
- Async orchestration in XState is verbose — invoked services for each SDK call, large config objects
- Runtime dependency (~30KB) with its own mental model and vocabulary (guards, actors, spawn, interpret)
- The error handling consistency problem that XState would have helped with has already been solved by the PRD v2.0 remediation

### When it makes sense
15+ distinct states, concurrent regions, hierarchical substates, or multiple actors coordinating. Checkout flows with payment retries, inventory holds, and timeout cancellation — that's XState territory. The ADW workflows have ~5 states at most.

### Verdict
XState solves a problem the codebase doesn't quite have. The workflows are stateful but not *complex* stateful. If retry logic grew significantly (review triggers test triggers re-build triggers re-review), XState would start earning its keep.

---

## 4. Convex Workflows (Durable Execution)

Move orchestration, state, and scheduling into Convex. Actual agent execution + git ops remain on external compute (VM, container, Railway).

### Strengths
- Durability — workflow survives machine sleep, crashes, network drops; resumes from last completed step
- Step-level persistence and retryability — no manual `status.json`
- Native scheduling (`ctx.scheduler.runAfter()`) replaces local cron hacks
- Observability via Convex dashboard + queryable state — can build UI on top
- Multi-user / multi-trigger — GitHub webhooks, UI buttons, multiple developers
- Concurrency control — mutations serialized per-document, workflow deduplication for free
- Resolves the modular composition debate: Convex Workflows *is* the workflow engine

### Weaknesses
- **Execution environment mismatch** — `createSDK()` spawns local Claude Code CLI processes; Convex functions run in V8 isolates with no filesystem, no child processes, no git. Fundamental constraint.
- Requires split architecture: Convex for orchestration, external runner for compute. Two environments to maintain and debug.
- Git state management becomes the hardest problem — concurrent workflows can't share a checkout. Needs worktrees or containerized runners.
- Adds latency per step: Convex invocation → HTTP to runner → execution → HTTP response → Convex journals result
- Cost: Convex function invocations + database reads/writes on top of Claude API costs
- Debugging goes from "read log file" to "check dashboard, then runner logs, then correlate timestamps"

### Pragmatic migration path
Keep runners as-is. Move state, scheduling, and reporting into Convex first. Workflows still run locally (or on a VM) but read config from Convex and write results back. Gets observability and durability without full distributed architecture.

### When it makes sense
When you need any two of: reliability across restarts, multi-user triggering, UI for workflow status.

---

## 5. Effect.ts (Typed Functional Effects)

Rewrite workflows using Effect's composable computation model with typed errors, dependency injection, and built-in retry/concurrency.

### Strengths
- **Typed error channel** — `Effect<string, PlanStepError | SDKError, WorkflowContext>` replaces `success: boolean`. Compiler enforces exhaustive error handling. The `adw_review.ts` `ok` field omission bug (caught in PRD v2.0) would have been a compile error.
- **Declarative retry** — `adw_test.ts`'s 100-line retry loop becomes `Effect.retry(Schedule.recurs(3))` with conditional predicates. Attempt tracking, backoff, and conditional retry are native.
- **Dependency injection via Layers** — `getAdwEnv()`, `createSDK()`, `createCommentStep()`, `createLogger()` become swappable services. Can test workflows without hitting real GitHub or git. Currently impossible.
- **`runStep()` becomes a natural Effect combinator** — middleware wrapping an effectful computation with tracing, logging, error mapping.
- **Structured concurrency** — research workflow's parallel agents get bounded parallelism, automatic cancellation on failure, proper resource cleanup via `Effect.all`.

### Weaknesses
- **Steep learning curve** — Effect has its own vocabulary (Effect, Layer, Service, Schedule, Fiber, Scope, Runtime), composition model (pipe/gen), and idioms. Code becomes unreadable to anyone who doesn't know Effect.
- **All-or-nothing in practice** — value comes from typed errors propagating through the entire stack. Partial adoption means constant `Effect.runPromise` conversions at boundaries. Realistically requires converting the shared layer + all 13 workflows.
- **Ceremony-to-logic ratio** — `adw_plan_build.ts` is 104 lines. Effect version would be similar length but denser and harder to read, for no functional gain on linear workflows.
- **Bun compatibility** — works but less battle-tested than Node for tracing integrations and fiber scheduling.
- **Solo developer** — typed errors as documentation and enforced handling scale with team size. When you're the only reader/writer, the type system protects against mistakes you're unlikely to make.

### When it makes sense
When any two of: second developer joins, retry logic grows significantly more complex, need to test workflows without side effects.

### The unique value
Effect is the only option that addresses testability — the ability to swap `GitHubLive` for `GitHubTest` (no-op comments) without changing workflow code. No other approach offers this without significant custom infrastructure.

---

## Recommendations

**Short term (now):** Stay with the current imperative approach. It's clean post-remediation, readable, and the workflows are stable. No architectural change is justified by the current pain points.

**If you need durability/multi-user:** Move orchestration to Convex Workflows while keeping local/remote runners for execution. This is the highest-value change for the least disruption to workflow logic.

**If you need testability:** Effect.ts is the cleanest path, but only commit to it when there's a second developer or when workflow complexity justifies the learning curve.

**If you need dynamic pipelines:** Modular composition becomes necessary. Consider this if/when users or config files need to define custom step sequences.

**XState:** Not recommended for this codebase at current complexity. Revisit only if workflows develop complex branching with 10+ distinct states.
