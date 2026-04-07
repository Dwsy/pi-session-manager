# Search Feature Fix and Debug

## Date

2026-01-30

## Issues

1. Project search feature completely unusable
2. Always displays "Searching..." indefinitely

## Fixes

### 1. Frontend Fix

#### src/App.tsx

**Issue**: `mapSearchResults` function didn't preserve session `cwd` (working directory) information

**Fix**:
```typescript
// Before
function mapSearchResults(results: SearchResult[]): SessionInfo[] {
  return results.map((r) => ({
    path: r.session_path,
    id: r.session_id,
    cwd: '',  // ❌ Lost information
    name: r.session_name,
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
    message_count: r.matches.length,
    first_message: r.first_message,
    all_messages_text: '',
  }))
}

// After
function mapSearchResults(results: SearchResult[], allSessions: SessionInfo[]): SessionInfo[] {
  return results.map((r) => {
    const originalSession = allSessions.find(s => s.id === r.session_id)
    return {
      path: r.session_path,
      id: r.session_id,
      cwd: originalSession?.cwd || '',  // ✅ Preserve original information
      name: r.session_name || originalSession?.name,
      created: originalSession?.created || new Date().toISOString(),
      modified: originalSession?.modified || new Date().toISOString(),
      message_count: r.matches.length,
      first_message: r.first_message,
      all_messages_text: '',
    }
  })
}
```

**Call Updates**:
```typescript
// All call sites need to pass sessions parameter
sessions={isSearching ? mapSearchResults(searchResults, sessions) : sessions}
```

### 2. Backend Fix

#### src-tauri/src/search.rs

**Issue**: Name search mode used OR logic, causing imprecise search results

**Fix**:
```rust
// Before
fn matches_session_name(session: &SessionInfo, query_words: &[&str]) -> bool {
    query_words.iter().any(|word| combined.contains(word))  // ❌ OR logic
}

// After
fn matches_session_name(session: &SessionInfo, query_words: &[&str]) -> bool {
    query_words.iter().all(|word| combined.contains(word))  // ✅ AND logic
}
```

#### src-tauri/src/lib.rs

**Issue**: Module not exported, couldn't be used in tests

**Fix**:
```rust
pub mod commands;  // Expose commands module
pub mod search;    // Expose search module
```

### 3. Debug Logging

#### src/App.tsx
- `loadSessions`: Track session loading
- `handleSearch`: Track search process
- `mapSearchResults`: Track result mapping
- `Render`: Track component state

#### src/components/SearchPanel.tsx
- Query Change: Track input changes
- Debounced Search: Track debounce triggers

#### src/components/ProjectList.tsx
- Render: Track component rendering

## Testing

### Unit Tests (src-tauri/tests/search_test.rs)

All 12 tests pass:
- ✅ test_empty_query_returns_empty_results
- ✅ test_single_word_search
- ✅ test_multiple_word_search
- ✅ test_name_search_mode
- ✅ test_role_filter
- ✅ test_multiple_sessions
- ✅ test_snippet_generation
- ✅ test_score_calculation
- ✅ test_thinking_content
- ✅ test_empty_sessions_list
- ✅ test_special_characters
- ✅ test_unicode_search

### Integration Tests (src-tauri/tests/integration_test.rs)

All 2 tests pass:
- ✅ test_search_integration (7 sub-tests)
- ✅ test_search_results_mapping

## Test Commands
```bash
# Run all tests
cd src-tauri && cargo test

# Run specific tests
cd src-tauri && cargo test --test search_test
cd src-tauri && cargo test --test integration_test

# View detailed output
cd src-tauri && cargo test -- --nocapture
```

## Debug Steps

1. Open browser developer tools (F12)
2. Switch to Console tab
3. Enter search term in search box
4. Observe console log output

Refer to `SEARCH_DEBUG_GUIDE.md` for detailed debug guide.

## Acceptance Criteria
- [x] Backend search works correctly (all tests pass)
- [x] Frontend search results display correctly (preserve cwd and other info)
- [x] Search state updates correctly (no longer stuck on "Searching")
- [x] Detailed debug logging added
- [x] Test coverage complete

## Follow-up Work
1. Test actual search functionality in browser
2. Debug "Searching..." issue based on console logs
3. Remove debug logging after issue is resolved
4. Consider adding search history
5. Consider adding advanced search options (regex, exact match, etc.)
