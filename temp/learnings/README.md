# Runtime Learnings

Structured entries capturing runtime experience from agent workflows (Ralph, SDLC, manual).
Consumed by `adw_learn` → triaged to experts → selective `self-improve` passes.

## Entry Schema

Each learnings file (`temp/learnings/{run_id}.md`) contains one or more YAML entries in a fenced block:

```yaml
- id: learn-{sequential}
  workflow: adw_ralph | adw_sdlc | manual
  run_id: "{workflow}-{date}-{short-hash}"
  date: YYYY-MM-DD
  tags: [convex, queries, indexes, ...]
  context: "Brief description of what was being attempted"
  expected: "What the agent expected based on current expertise"
  actual: "What actually happened"
  resolution: "How it was resolved (optional — unresolved learnings are valid)"
  expertise_rule_violated: "Reference to specific rule if applicable (optional)"
  confidence: high | medium | low
  platform_context:
    convex: "x.y.z"
    sveltekit: "x.y.z"
```

## Field Reference

| Field | Required | Description |
|-------|----------|-------------|
| `id` | yes | Sequential ID: `learn-1`, `learn-2`, etc. Per-file sequence. |
| `workflow` | yes | Source workflow: `adw_ralph`, `adw_sdlc`, or `manual` |
| `run_id` | yes | Workflow run identifier for traceability |
| `date` | yes | ISO date (YYYY-MM-DD) when the learning occurred |
| `tags` | yes | Domain tags for expert triage (must intersect with expert's `domain_tags`) |
| `context` | yes | What was being attempted |
| `expected` | yes | What the agent expected to happen |
| `actual` | yes | What actually happened |
| `resolution` | no | How it was resolved. Omit for unresolved learnings. |
| `expertise_rule_violated` | no | Reference to specific expertise rule that was wrong/missing |
| `confidence` | yes | How confident the learning is: `high` (reproduced), `medium` (observed once), `low` (suspected) |
| `platform_context` | yes | Version map of relevant platforms at time of learning |

## Covered Scenarios

- **Resolved failures**: `resolution` present, high confidence — strongest signal for expertise updates
- **Unresolved failures**: no `resolution` — flags knowledge gaps for investigation
- **Negative knowledge**: "don't do X" — `expected` describes the wrong approach, `actual` describes why it fails
- **Version-specific findings**: `platform_context` enables conflict resolution when platform versions change

## Processing

1. `adw_learn` reads all `temp/learnings/*.md` files
2. For each expert, filters entries where `tags` intersect with expert's `domain_tags`
3. Matched entries feed into targeted `self-improve` passes
4. Processed entries are archived to `temp/learnings/archive/`
