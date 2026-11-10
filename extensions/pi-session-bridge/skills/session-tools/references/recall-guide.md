# Session Recall Guide

## Why use recall?
Raw session files (`.jsonl`) can contain hundreds of messages, large tool results, and chain-of-thought blocks. Reading raw files rapidly exhausts context windows.
`pi-session-cli recall` filters and extracts tightly bounded dialogue windows in native Rust, safely truncating oversized entries.

## Usage

### 1. Global Recall
```bash
pi-session-cli recall "refactor config module" --before 2 --after 2 --max 3
```

### 2. File-Direct Recall
```bash
pi-session-cli recall /path/to/session.jsonl --query "TypeError" --max 2
```

### 3. JSON Output
```bash
pi-session-cli recall "fix verification" --json
```
