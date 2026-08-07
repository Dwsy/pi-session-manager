# Session Decision Map — Implementation and Handoff Summary

**Date:** 2026-08-07
**Status:** implementation complete for the current code slice; automated checks pass; full release-level UI smoke remains partially unproven
**Related plan:** `docs/plans/2026-08-07-session-decision-map-implementation.md`
**Plugin:** `builtin.session-graph` / tree view `builtin.session-graph.flow`

## 1. Executive summary

This work extends the existing **Session Graph / Branch Map** plugin with a semantic **Decision Map** rather than introducing a second graph plugin.

The implemented design keeps the JSONL branch topology as source of truth and adds a persisted semantic layer containing only high-signal decisions, checkpoints, outcomes, and unresolved questions. Semantic nodes are accepted only when their anchors reference real session entries. Generation is explicit and user-triggered; enabling or opening the plugin does not automatically spend model tokens.

The implementation now has two complementary modes inside the same tree-view contribution:

- **Decisions** — a dense semantic view intended to answer “what did this session decide, why did it matter, and where is the evidence?”
- **Topology** — the existing Branch Map source-of-truth view, preserving its settings and branch semantics.

A second pass strengthened the agent layer. The extraction agent now uses a higher internal reasoning budget, an explicit evidence gate, and a salience-aware context builder so high-value user/assistant decisions and structural session events are less likely to be drowned out by routine tool output. The agent is explicitly instructed to keep its reasoning private and return only the validated JSON result.

Automated verification currently passes for the focused plugin tests, extension TypeScript checking, and diff whitespace checking. A real browser session also confirmed that the Session Graph plugin can be toggled through the settings UI without a visible runtime error. However, the complete release smoke sequence from **enable → generate → multi-branch navigate → stale → refresh → keyboard/reduced-motion → disable** has not been fully demonstrated end to end in this work session and should remain a release checklist item.

## 2. Product decisions retained from the plan

### 2.1 Extend the existing plugin

The implementation preserves:

- plugin ID: `builtin.session-graph`
- tree-view contribution ID: `builtin.session-graph.flow`
- title: `Branch Map`
- existing Branch Map model and topology utilities
- existing Branch Map settings persistence

No parallel “decision graph” plugin or competing tree-view contribution was added.

### 2.2 Default-off, manual inference

`extensions/psm-session-graph/manifest.ts` now declares:

- `defaultEnabled: false`
- `sessions:read`
- `records:read`
- `records:write`
- `agent:invoke`
- `model:invoke`
- session-scoped record type `session.decision_graph`, schema version 1

The view loads saved records on render but does not invoke the agent automatically. The model is called only from the explicit Generate/Refresh action.

This preserves the intended cost model: the feature is opt-in and inference is user-triggered.

### 2.3 Semantic graph is an overlay, not source of truth

The semantic map never replaces the branch model. The existing `buildSessionBranchModel(...)` and `resolveBranchNavigation(...)` remain authoritative for topology and source navigation.

Every semantic node is validated against the real session entry set before it can be persisted or rendered as a valid graph. This is the primary anti-hallucination boundary.

### 2.4 No fake checkpoint fork

No “Fork from here” action was added. The existing backend fork contract is session-level and does not provide verified checkpoint semantics, so the UI does not pretend otherwise.

## 3. Architecture after implementation

### 3.1 Activation and capability injection

`extensions/psm-session-graph/index.ts` now registers the existing tree view from inside `activate(ctx)` and captures `ctx.psm` in the render closure.

The render boundary passes the following into `SessionGraphView`:

- `client: ctx.psm`
- current `session`
- current JSONL `entries`
- `activeEntryId`
- `onNavigate`
- `labelsByTargetId`

This keeps record and agent access inside the plugin capability boundary. The Decision Map does not import app transport/backend APIs directly.

### 3.2 Persisted record

The record contract is:

- record type: `session.decision_graph`
- scope type: `session`
- scope ID: the current `session.path`
- schema version: `1`
- deterministic record ID based on `builtin.session-graph` plus the session path

The semantic payload contains:

- generation timestamp
- freshness source marker
- semantic nodes
- semantic edges

The current semantic vocabulary is intentionally small:

- node kinds: `decision`, `checkpoint`, `outcome`, `open_question`
- edge kinds: `leads_to`, `depends_on`, `supersedes`, `resolves`
- optional statuses: `active`, `superseded`, `resolved`, `open`

### 3.3 Validation boundary

`decisionGraphTypes.ts` owns runtime-safe graph validation and freshness logic.

Before a generated graph is accepted, validation checks the persisted/runtime shape and rejects unsupported or unsafe data, including references to unknown session entries and invalid graph relationships. Evidence entry IDs are normalized/deduplicated.

The important persistence invariant is:

> model output is parsed and validated first; `records.upsert(...)` happens only after validation succeeds.

Therefore malformed JSON, invalid node structure, unknown anchors, or invalid edge endpoints cannot replace the previous valid record.

### 3.4 Freshness

Freshness uses the plan’s deterministic marker:

- `entryCount`
- `lastEntryId`

A stored graph is current only when both still match the live entries supplied to the tree-view render path. New session entries make the stored graph stale, but do not trigger automatic inference.

## 4. Agent extraction and reasoning design

### 4.1 Host-managed agent session

`refreshDecisionGraphWithAgent(...)` creates a host-managed agent session with:

- purpose: `session-decision-map`
- model: `host-default`
- thinking level: `high`
- no tools
- memory-only agent storage

The agent session is disposed in `finally`, including failure paths.

The higher reasoning level is deliberate because generation is manual rather than background/continuous. It trades some latency/cost at explicit user action time for better discrimination between real decisions and ordinary execution steps.

### 4.2 Private reasoning, structured visible output

The system prompt explicitly tells the agent to reason carefully while keeping that reasoning private. It must not emit analysis, candidate lists, confidence notes, or chain-of-thought. The only visible agent response consumed by the plugin is the final JSON object.

This is important for two reasons:

1. the semantic record should contain auditable conclusions, not hidden-work narration;
2. downstream validation can operate on one strict machine-readable contract.

### 4.3 Evidence gate

The prompt now requires an evidence gate for every node:

- identify the candidate claim;
- find the strongest supplied `ENTRY` that directly supports it;
- discard the candidate if support is only implied or speculative.

Additional constraints include:

- a **decision** should anchor where the choice/commitment is actually stated, not at a later implementation step;
- a **checkpoint** requires explicit evidence of a changed goal, constraint, or execution direction;
- a **tool call alone is not an outcome** — an outcome should be supported by a tool result, assistant conclusion, or user confirmation;
- an **open question** should not survive if later supplied evidence answers it;
- `anchorEntryId` should be the strongest single source;
- `evidenceEntryIds` should be a minimal set of additional material evidence;
- summaries may include rationale/consequences only when the supplied entries support them;
- chronological proximity alone is not causality;
- edges are emitted only when evidence supports the relation;
- insufficient evidence is a valid successful result: `{"nodes":[],"edges":[]}`.

### 4.4 Salience-aware bounded context

The previous context builder sampled analyzable entries evenly. That was bounded, but could still allow large volumes of routine tool output to displace high-value decision evidence.

`decisionGraphContext.ts` now classifies analyzable entries as:

- `primary` — user/assistant messages and structural decision-relevant events;
- `evidence` — tool results;
- `context` — lower-priority supporting content.

Structural entries such as labels, branch events, compactions, and model changes are treated as primary when they contain useful data.

The builder keeps hard bounds:

- maximum entries: `80`
- maximum total context: `36,000` characters
- minimum per-entry text budget: `180` characters

Within that budget it preferentially reserves capacity for:

- up to 60 primary entries;
- up to 16 evidence entries;
- remaining slots filled from other candidates;
- final selected entries restored to chronological input order.

Session metadata is preserved where useful, including:

- provider
- model ID
- thinking level

Each emitted context item identifies its real session entry ID and its signal class. The model therefore reasons over evidence that remains directly navigable and later validateable.

## 5. Decision UI behavior

### 5.1 One surface, two modes

`SessionGraphView` owns local `decisions | topology` mode state.

The Topology branch still renders the existing `GlobalMap` with the existing branch model, settings, selection, activation, and Atlas dialog wiring.

Decision mode renders the semantic record without creating a second plugin surface.

### 5.2 Loading and generation states

The view distinguishes:

- saved-record loading;
- no generated record;
- active generation/refresh;
- ready graph;
- stale graph;
- generation/read error;
- valid graph with zero high-signal nodes.

With no record, the user sees a Generate action. With a record, the same action becomes Refresh. Agent invocation occurs only through this explicit handler.

### 5.3 Stale behavior

When source freshness no longer matches current entries:

- the old semantic graph remains visible;
- the UI marks it `Stale`;
- a non-blocking message explains that the session has advanced;
- Refresh is available to regenerate explicitly.

No automatic model call occurs on entry changes.

### 5.4 Failure preservation

During explicit refresh, errors set an error message but do not clear the existing `decisionGraph`. The last valid graph therefore remains available after generation failure.

This matches the plan’s non-destructive refresh requirement.

### 5.5 Successful no-decisions state

A review pass found one concrete DoD gap: a valid semantic payload with `nodes: []` previously rendered as a blank list area.

That is now fixed. A zero-node valid graph renders the successful state:

> No high-signal decisions found.

It is not treated as an error, and the empty graph list is not rendered.

### 5.6 Evidence navigation

Every displayed node exposes its primary source plus additional evidence as buttons.

Activating an evidence/source entry:

1. resolves the real entry in the shared session branch model;
2. calls `resolveBranchNavigation(...)`;
3. updates the shared selected branch UID;
4. delegates the resolved `(leafId, targetId)` to the tree-view `onNavigate` host callback.

This correctly handles branch-aware cases such as labels/tool results where the persisted entry is not necessarily the final visual navigation target.

Switching to Topology uses the same `selectedUid`, so source navigation carries semantic selection into the topology view.

## 6. Styling and accessibility intent

Decision Map styles were added to the existing `src/styles/_branch-atlas.less` surface rather than introducing a separate visual system.

The implementation uses semantic text labels for node kinds/statuses and accessible names on mode/evidence controls. Generate/Refresh and the mode switch are native buttons.

Important release caveat: the original plan also asks for explicit arrow-key movement between semantic nodes and reduced-motion verification. The current reviewed `SessionGraphView` does not contain a dedicated roving-focus/ArrowUp/ArrowDown handler for semantic node rows, and this work session did not complete a reduced-motion browser smoke. Those items should not be considered fully proven solely from the existing automated tests.

## 7. Test coverage added or extended

### 7.1 Plugin/semantic tests

`extensions/psm-session-graph/psm-session-graph.test.ts` covers contracts including:

- single preserved Branch Map contribution;
- default-off manifest behavior and semantic record capability declarations;
- anchor validation;
- evidence deduplication;
- fresh vs appended-entry stale detection;
- bounded decision-agent context;
- salience preservation when 120 routine tool-result entries surround critical decision/structural entries;
- agent creation with `thinkingLevel: "high"` and evidence-gated prompt;
- generated output validation before record persistence;
- correct session-scoped upsert behavior;
- agent disposal.

### 7.2 Decision UI tests

`extensions/psm-session-graph/SessionGraphView.test.tsx` covers:

- loading a saved graph from the current session scope;
- branch-aware source navigation through `onNavigate`;
- stale state when source entries advance;
- successful zero-decision state;
- preservation of the existing topology view behind the mode switch.

### 7.3 Verification observed in this work session

The latest focused verification reported:

```text
pnpm exec vitest run \
  extensions/psm-session-graph/psm-session-graph.test.ts \
  extensions/psm-session-graph/SessionGraphView.test.tsx
```

Result: **2 files, 12/12 tests passed**.

Extension type checking also passed:

```text
pnpm run typecheck:extensions
```

Diff whitespace/integrity check passed:

```text
git diff --check
```

## 8. Browser smoke evidence and its limits

A real running PSM browser session was used during verification.

Observed:

- Session Graph was mapped to the correct plugin settings checkbox;
- it was observed disabled (`checked=false`);
- the actual interactive label was clicked;
- it was immediately observed enabled (`checked=true`);
- no visible page text matching `error`, `failed`, or `exception` was detected after the toggle.

A later browser snapshot showed the application at the Dashboard/Settings surface, with plugin controls present and no visible runtime error. It did **not** have a session open with the Decision Map visible at that moment.

Therefore the following full smoke sequence from the original plan is **not completely evidenced by this session**:

1. clean-config default disabled;
2. enable plugin;
3. open a real multi-branch session;
4. verify Decisions opens without automatic generation;
5. Generate Decisions;
6. inspect multiple real evidence anchors;
7. navigate nodes on at least two branches;
8. switch to Topology and verify source continuity;
9. append a new session entry and observe stale state;
10. Refresh and observe persisted replacement;
11. exercise keyboard navigation/activation;
12. exercise reduced-motion mode;
13. disable plugin and confirm contribution removal.

The automated tests cover several of these contracts, but release signoff should still execute the browser sequence directly.

## 9. Plan alignment matrix

| Area | Current status | Evidence / note |
| --- | --- | --- |
| Existing plugin ID/contribution preserved | Implemented | `manifest.ts`, `index.ts` |
| Default-disabled | Implemented + unit tested | `defaultEnabled: false` |
| Required capabilities + schema v1 | Implemented + unit tested | manifest test |
| Session-scoped persisted semantic graph | Implemented + unit tested | `records.listForScope` / `records.upsert` |
| Runtime-safe graph/anchor validation | Implemented + unit tested | `decisionGraphTypes.ts` |
| Freshness by count + last entry | Implemented + unit tested | fresh/stale assertions |
| Manual Generate/Refresh only | Implemented | no agent call in load effect |
| Failure preserves last valid graph | Implemented in refresh path | refresh catch leaves graph intact |
| Bounded long-session context | Implemented + regression tested | 80 entries / 36k chars |
| Evidence-grounded agent reasoning | Implemented + contract tested | high thinking + evidence gate |
| Decisions/Topology switch | Implemented + UI tested | `SessionGraphView` |
| Stale graph remains readable | Implemented + UI tested | stale message + retained graph |
| Successful no-decisions state | Implemented + UI tested | review fix |
| Evidence/source branch navigation | Implemented + UI tested | `resolveBranchNavigation` → `onNavigate` |
| Shared source selection into Topology | Implemented structurally | shared `selectedUid`; smoke still desirable |
| Dedicated semantic-node arrow-key navigation | Not fully implemented/proven | no explicit roving ArrowUp/ArrowDown handler found |
| Reduced-motion release verification | Not fully proven | browser smoke not completed |
| Full enable→generate→navigate→stale→refresh→disable smoke | Partial only | must be completed before release signoff |
| Checkpoint-aware fork | Deliberately absent | backend/API semantics not defined |

## 10. Intentional implementation differences from the original plan

### 10.1 No separate `decisionGraphRecord.ts`

The plan suggested a separate record module, but the current implementation keeps parsing/validation/freshness responsibilities in `decisionGraphTypes.ts`. This is an organizational difference, not a product-contract change.

### 10.2 Navigation uses the tree-view host callback

The plan described direct use of `viewer.navigateBranch(...)` with `viewer.revealEntry(...)` fallback. The current tree-view implementation instead resolves the correct branch/target itself and calls the SDK-provided `onNavigate(leafId, targetId)` callback.

The repository SDK exposes `onNavigate` as a first-class `PsmSessionTreeViewRenderProps` contract, so this is a legitimate host delegation path. If strict conformance to the plan’s exact viewer-controller call sequence is required, that should be reconciled explicitly rather than silently assumed.

### 10.3 Agent reasoning was strengthened beyond the first implementation pass

The original plan required a structured extraction prompt and bounded context. The final implementation additionally adds:

- `high` internal reasoning level;
- explicit private-reasoning instruction;
- evidence gating per node;
- stronger distinction between action and outcome;
- anti-post-hoc causality rule;
- salience-aware context prioritization;
- provider/model/thinking metadata for structural context;
- a crowded-context regression test.

These changes reinforce the original anti-hallucination goal without changing the persisted schema.

## 11. Working-tree scope warning

The current working tree contains Session Decision Map work **and** separate OMP resume-command changes.

Session Decision Map-related files include:

- `docs/plans/2026-08-07-session-decision-map-implementation.md`
- `docs/plans/2026-08-07-session-decision-map-summary.md` (this document)
- `extensions/psm-session-graph/manifest.ts`
- `extensions/psm-session-graph/index.ts`
- `extensions/psm-session-graph/SessionGraphView.tsx`
- `extensions/psm-session-graph/SessionGraphView.test.tsx`
- `extensions/psm-session-graph/decisionGraphTypes.ts`
- `extensions/psm-session-graph/decisionGraphContext.ts`
- `extensions/psm-session-graph/decisionGraphAgent.ts`
- `extensions/psm-session-graph/psm-session-graph.test.ts`
- `src/styles/_branch-atlas.less`

Other modified/untracked files observed in the same working tree include OMP/session-resume work such as:

- `src/App.tsx`
- `src/utils/sessionResume.ts`
- `src/utils/sessionResume.test.ts`

Those should be reviewed/committed separately if the goal is a clean Session Decision Map change set.

## 12. Remaining release work

Before treating the feature as fully release-signed, the highest-value follow-ups are:

1. **Complete the full browser smoke sequence** on a real branched session, including actual agent generation and refresh persistence.
2. **Add explicit semantic-node keyboard movement** (for example a roving focus model with ArrowUp/ArrowDown) and a corresponding UI test if the plan’s keyboard requirement remains binding.
3. **Verify reduced-motion behavior in the running UI**, not only by stylesheet convention.
4. **Exercise multi-branch evidence navigation in-browser**, including a label/tool-result case and branch continuity after switching to Topology.
5. **Verify stale → refresh end to end** by actually appending/continuing the underlying session and observing the old graph remain visible until explicit refresh.
6. **Separate unrelated OMP resume changes** from this feature before final review/commit.
7. If strict plan conformance is required, decide whether `onNavigate(...)` is the accepted tree-view abstraction or whether the implementation should receive/use `viewer` explicitly.

## 13. Final technical assessment

The current implementation establishes the core Decision Map architecture cleanly:

- opt-in plugin contract;
- semantic record schema;
- deterministic freshness;
- validated real-entry anchors;
- non-destructive persistence;
- manual model invocation;
- bounded, salience-aware context;
- evidence-gated high-reasoning extraction;
- semantic/ground-truth mode coexistence;
- branch-aware evidence navigation;
- explicit stale/error/no-result states.

The most important quality improvement from the reasoning pass is that the system no longer relies on “ask the model to summarize decisions” as the primary safety mechanism. It now combines **input prioritization**, **private higher-effort reasoning**, **prompt-level evidence criteria**, and **post-generation structural/anchor validation**. That layered design makes semantic claims more auditable and reduces the chance that ordinary tool execution or mere temporal adjacency is promoted into a false decision narrative.

The implementation is in a strong state for continued integration, but the release checklist should remain honest: automated contracts are green, while the full interactive smoke and explicit semantic-node keyboard behavior still need direct proof before claiming the original Definition of Done in full.
