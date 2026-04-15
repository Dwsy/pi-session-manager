# Tool Call Folding - Single Source of Truth

## Requirements

### User Goal
When viewing a session, fold multiple consecutive assistant messages (containing tool calls but no text output) into a single collapsible summary line. The assistant text output must always remain visible outside the fold area.

### Folding Rules
1. **Consecutive assistant messages with tools only** (no text blocks) are merged into one fold group
2. **Assistant text output is NEVER folded** - it always renders independently, at the same level as user messages
3. **Fold boundary**: Everything before the first `text` content block in the assistant chain folds; the `text` block stays outside
4. **If no text block exists at all**, the last assistant in the chain becomes the leader and renders the fold

### Example Scenario
```
Input sequence (renderable entries):
  [User]      "路由是如何工作的..."
  [Agent a1]  [thinking] + [toolCall: bash] + [toolCall: bash]      ← no text
  [Agent a2]  [thinking] + [toolCall: bash] + [toolCall: bash] + [toolCall: bash]  ← no text
  [Agent a3]  [toolCall: read] + [text: "工具调用渲染架构总结..."]   ← HAS text → leader

Expected rendering:
  [User] "路由是如何工作的..."
  [▸ bash(2) bash(3) read(1) ⏱45s]     ← fold header (merges a1 + a2 + a3 tools)
    [expanded: a1-thinking, a1-tools, a2-thinking, a2-tools, a3-tools]
  工具调用渲染架构总结...                ← text outside fold, normal rendering
```

---

## JSONL File Structure

### Location
`~/.pi/agent/sessions/--{cwd}--/{timestamp}_{id}.jsonl`

### Entry Types
Each line is a JSON object with a `type` field:

| Type | Fields | Description |
|------|--------|-------------|
| `session` | `id`, `timestamp`, `cwd` | Session header |
| `message` | `id`, `parentId`, `timestamp`, `message` | User/assistant/toolResult |
| `model_change` | `id`, `parentId`, `timestamp`, `provider`, `modelId` | Model switch |
| `thinking_level_change` | `id`, `timestamp`, `thinkingLevel` | Thinking mode change |
| `compaction` | `id`, `timestamp`, `tokensBefore`, `summary` | Context compaction |
| `branch_summary` | `id`, `timestamp`, `summary` | Branch merge summary |
| `custom_message` | `id`, `timestamp`, `customType`, `content` | Custom entry |

### Message Entry Structure
```json
{
  "type": "message",
  "id": "abc123",
  "parentId": "parent-id",
  "timestamp": "2026-04-14T06:42:03.285Z",
  "message": {
    "role": "assistant",         // "user" | "assistant" | "toolResult"
    "content": [                  // Array of content blocks
      { "type": "thinking", "thinking": "..." },
      { "type": "text", "text": "..." },
      { "type": "toolCall", "id": "call_xxx", "name": "bash", "arguments": {...} }
    ],
    "usage": {
      "input": 1000,
      "output": 500,
      "cacheRead": 0,
      "cacheWrite": 0,
      "cost": { "input": 0.003, "output": 0.0075, "total": 0.0105 }
    }
  }
}
```

### Content Block Types
| Type | Key Fields |
|------|-----------|
| `thinking` | `thinking` (string) |
| `text` | `text` (string) |
| `toolCall` | `id`, `name`, `arguments` |

### Tool Result Entry
```json
{
  "type": "message",
  "message": {
    "role": "toolResult",
    "toolCallId": "call_xxx",
    "content": [{ "type": "text", "text": "..." }],
    "details": { "duration": 1200 }   // milliseconds
  }
}
```

---

## Rendering Pipeline

### Step 1: Build Renderable Entries
Filter `entries` to only include:
- `message` entries with `role === "user"` or `role === "assistant"`
- Non-message renderable entries (`model_change`, `compaction`, `branch_summary`, `custom_message`)

### Step 2: Compute Fold Groups
Scan renderable entries sequentially:

```
foldBuffer = []
for each entry in renderableEntries:
  if entry is assistant:
    hasTools = entry has toolCall content
    hasText = entry has text content

    if hasTools AND NOT hasText:
      foldBuffer.push(entry)          // accumulate
    else:
      if foldBuffer not empty:
        createFoldGroup(foldBuffer, entry as leader)
        mark foldBuffer entries as hidden
        foldBuffer = []
  else:
    if foldBuffer not empty:
      createFoldGroup(foldBuffer, last fold entry as leader)
      mark foldBuffer entries as hidden
      foldBuffer = []
```

### Step 3: Virtual Scroll Integration
- Hidden entries get `estimateSize = 0` (no space reserved)
- Leader entries render with `foldEntries` prop containing merged entries

### Step 4: Per-Entry Rendering
```
AssistantMessage(entry, foldEntries?):
  if foldEntries exists and has length:
    render fold header (merged tool stats)
    if expanded:
      render thinking from all foldEntries
      render tool calls from all foldEntries
  render text blocks (always, never folded)
  render own tool calls (if no foldEntries)
```

---

## Test Script

### Purpose
Parse a real JSONL session file and verify fold group computation matches expected behavior.

### Implementation (`test-fold-merge.ts`)
```typescript
#!/usr/bin/env tsx
import { readFileSync } from 'node:fs'

interface Content { type: string; text?: string; thinking?: string; name?: string }
interface Message { role: string; content?: Content[] }
interface Entry { type: string; id: string; timestamp: string; message?: Message }

const filePath = process.argv[2]
const lines = readFileSync(filePath, 'utf-8').split('\n').filter(Boolean)
const entries: Entry[] = lines.map(l => JSON.parse(l))

// Filter to renderable (user + assistant messages)
const renderable = entries.filter(e =>
  e.type === 'message' && (e.message?.role === 'user' || e.message?.role === 'assistant')
)

// Compute fold groups (same logic as useFoldGroups)
interface FoldGroup { leaderId: string; entries: Entry[] }
const groups: FoldGroup[] = []
const hiddenIds = new Set<string>()
let foldBuffer: Entry[] = []

for (const entry of renderable) {
  const isAssistant = entry.type === 'message' && entry.message?.role === 'assistant'
  if (isAssistant) {
    const content = entry.message?.content || []
    const hasTools = content.some(c => c.type === 'toolCall')
    const hasText = content.some(c => c.type === 'text')

    if (hasTools && !hasText) {
      foldBuffer.push(entry)
    } else {
      if (foldBuffer.length > 0) {
        groups.push({ leaderId: entry.id, entries: [...foldBuffer] })
        foldBuffer.forEach(e => hiddenIds.add(e.id))
        foldBuffer = []
      }
    }
  } else {
    if (foldBuffer.length > 0) {
      const leader = foldBuffer[foldBuffer.length - 1]
      groups.push({ leaderId: leader.id, entries: [...foldBuffer] })
      foldBuffer.forEach(e => hiddenIds.add(e.id))
      foldBuffer = []
    }
  }
}
if (foldBuffer.length > 0) {
  const leader = foldBuffer[foldBuffer.length - 1]
  groups.push({ leaderId: leader.id, entries: [...foldBuffer] })
  foldBuffer.forEach(e => hiddenIds.add(e.id))
}

// Output results
console.log(`Total renderable: ${renderable.length}`)
console.log(`Fold groups: ${groups.length}`)
console.log(`Hidden entries: ${hiddenIds.size}`)

for (const [i, g] of groups.entries()) {
  const leader = renderable.find(e => e.id === g.leaderId)
  const allTools = [
    ...g.entries.flatMap(e => (e.message?.content || []).filter(c => c.type === 'toolCall')),
    ...(leader?.message?.content || []).filter(c => c.type === 'toolCall')
  ]
  console.log(`Group ${i+1}: ${g.entries.length} folded → leader ${g.leaderId} (${allTools.length} total tools)`)
}
```

### Run
```bash
npx tsx test-fold-merge.ts "/Users/dengwenyu/.pi/agent/sessions/--Users-dengwenyu-Dev-AI-pi-session-manager--/2026-04-14T06-42-03-285Z_4ee573fe-2149-492d-aa73-d2c21bf3d327.jsonl"
```

### Test Data
Real session file for testing: `/Users/dengwenyu/.pi/agent/sessions/--Users-dengwenyu-Dev-AI-pi-session-manager--/2026-04-14T06-42-03-285Z_4ee573fe-2149-492d-aa73-d2c21bf3d327.jsonl`

---

## File Changes Summary

| File | Change |
|------|--------|
| `src/hooks/useFoldGroups.ts` | **NEW** - Hook computing fold groups and hidden entry IDs |
| `src/components/session-viewer/SessionViewerMessages.tsx` | Use `useFoldGroups`, pass `foldEntries` to renderer, skip hidden entries |
| `src/components/session-viewer/SessionEntryRenderer.tsx` | Accept `foldEntries` prop, pass to `AssistantMessage` |
| `src/components/messages/AssistantMessage.tsx` | Accept `foldEntries`, pass to `ToolCallList` |
| `src/components/tool-calls/ToolCallList.tsx` | Accept `foldEntries`, merge tool calls, render fold header |
| `src/styles/_tool-execution.less` | Add `.assistant-fold-*` CSS styles |

---

## Verification Checklist

- [ ] Each user message renders independently
- [ ] Consecutive assistant messages (tools only, no text) merge into one fold group
- [ ] Assistant text always renders outside the fold group
- [ ] Hidden entries have 0 height in virtual scroll
- [ ] Fold header shows aggregated tool names/counts
- [ ] Expanding fold shows all thinking blocks + tool call details
- [ ] No cross-user-message merging (each user turn is independent)
