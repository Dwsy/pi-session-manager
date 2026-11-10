# Session Inspection & Forensics

## Capabilities
`pi-session-cli inspect` diagnoses individual JSONL sessions:
- Extracts Session ID, working directory, creation timestamp
- Summarizes tool failures and specific error snippets
- Maps parent-child branch trees and active branch depth
- Calculates total Tokens and estimated costs

## Usage
```bash
# Inspect session
pi-session-cli inspect ./error-session.jsonl

# Machine-readable format
pi-session-cli inspect ./error-session.jsonl --json
```
