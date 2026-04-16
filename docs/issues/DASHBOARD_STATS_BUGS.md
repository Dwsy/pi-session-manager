# Dashboard Statistics Bugs

## Issue: Browser dataset stats calculation errors causing inflated token/cost and inaccurate model counts

### Severity: High

### Affected Files
- `src/browser-dataset/stats.ts`
- `src/components/dashboard/ProductivityMetrics.tsx`
- `src-tauri/src/domain/stats/aggregator.rs`

---

## Bug A: Heatmap token/cost multiplied by message entry count (CRITICAL)

**Location**: `src/browser-dataset/stats.ts:159-164`

**Problem**:
```ts
for (const entry of session.entries) {
  // ...
  heatmapDateTokens.set(date, (heatmapDateTokens.get(date) || 0) + sessionTotalTokens);
  heatmapDateCost.set(date, (heatmapDateTokens.get(date) || 0) + sessionTotalCost);
}
```

`sessionTotalTokens` and `sessionTotalCost` represent the **entire session's** totals, but they are being added inside a per-entry loop. A session with 20 messages will have its token count inflated 20x in the heatmap.

**Impact**: TokenTrendChart and HeatmapDayModal show completely incorrect token and cost values in browser/dataset mode.

**Fix**: Move `heatmapDateTokens`, `heatmapDateCost`, `heatmapDateSessions`, and `heatmapTopProject` updates outside the entry loop, so they are incremented **once per session**.

---

## Bug B: Multi-model session message count duplicated across all models

**Location**: `src/browser-dataset/stats.ts:239`

**Problem**:
```ts
tokenByModel[model].messages += session.info.message_count;
```

If a session uses both `gpt-4` and `claude-3.5`, both models get credited with the **full session message count**.

**Impact**: TopModelsChart message counts are inflated for multi-model sessions.

**Fix**: Count model messages per actual assistant entry matching that model, instead of assigning the entire session count to every model.

---

## Bug C: Runtime crash on empty time_distribution

**Location**: `src/components/dashboard/ProductivityMetrics.tsx:19-20`

**Problem**:
```ts
const peakHour = stats.time_distribution
  .reduce((max, p) => p.message_count > max.message_count ? p : max, stats.time_distribution[0])
```

When `time_distribution` is empty, `stats.time_distribution[0]` is `undefined`, causing a crash on `.message_count` access.

**Impact**: Blank dashboard / runtime exception for new users with no session data.

**Fix**: Guard with `.length > 0` check and provide a safe default `{ hour: 0, message_count: 0 }`.

---

## Bug D: Streak calculation skips trailing inactive days

**Location**: `src/components/dashboard/ProductivityMetrics.tsx:23-28`

**Problem**:
```ts
let streak = 0
for (let i = stats.heatmap_data.length - 1; i >= 0; i--) {
  if (stats.heatmap_data[i].level > 0) {
    streak++
  } else if (streak > 0) {
    break
  }
}
```

If the most recent days have `level === 0`, the loop skips them and counts an older streak. A streak should count **consecutive active days from the present backward**, stopping at the first inactive day.

**Impact**: Streak metric is misleading.

**Fix**: Change to `break` on the first `level === 0` regardless of current streak value.

---

## Bug E: Rust cache tokens roughly split 50/50 instead of exact values

**Location**: `src-tauri/src/domain/stats/aggregator.rs:502-503`

**Problem**:
```rust
total_cache_read += cache / 2; // approximate split
total_cache_write += cache / 2;
```

`cache` is already the sum of `cache_read + cache_write`. Dividing by 2 destroys the real ratio.

**Impact**: TokenStats panel shows inaccurate cache read/write split in desktop mode.

**Fix**: Return `cache_read` and `cache_write` as separate values from `process_session_data` instead of collapsing them into one sum.

---

## Bug F: Browser heatmap only generates 30 days instead of 365

**Location**: `src/browser-dataset/stats.ts:171-187`

**Problem**:
```ts
for (let index = 29; index >= 0; index -= 1) { ... }
```

The browser dataset generates only 30 heatmap points, while the Rust backend generates 365 days and the `ActivityHeatmap` UI expects a full year view.

**Impact**: Most of the yearly activity grid is blank in browser/dataset mode.

**Fix**: Align with Rust backend by generating 365 days.

---

## Verification Checklist

- [x] Browser dataset heatmap tokens match session-level totals (not multiplied)
- [x] Multi-model sessions do not duplicate message counts
- [x] Dashboard renders without crash when stats are empty
- [x] Streak is 0 when the most recent day has no activity
- [x] Rust cache read/write reflect actual parsed values
- [x] Browser heatmap covers 365 days
- [x] ActivityHeatmap displays full 53-week year view (was truncated at 26 weeks)
