#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

interface JsonObject {
  [key: string]: unknown;
}

interface SourceEntry extends JsonObject {
  __line: number;
  type: string;
  id?: string;
  parentId?: string | null;
  timestamp?: string;
}

interface TruncatedText {
  text: string;
  truncated: boolean;
  originalChars: number;
}

interface ToolSignals {
  failure: string[];
  success: string[];
  suspiciousSuccessWrapper: boolean;
}

interface ToolResultInfo {
  entryId: string | null;
  line: number;
  timestamp: string | null;
  toolName: string | null;
  isError: boolean;
  textChars: number;
  text: TruncatedText;
  evidence: string[];
  signals: ToolSignals;
  excerpt: TruncatedText;
}

interface ToolCallInfo {
  callId: string;
  entryId: string | null;
  line: number;
  timestamp: string | null;
  name: string;
  arguments: JsonObject;
  taskName: string | null;
  targetPath: string | null;
  command: TruncatedText | null;
  mentionedPaths: string[];
  bashMutationCandidate: boolean;
  result: ToolResultInfo | null;
}

interface SearchRecord {
  recordId: string;
  line: number;
  entryId: string | null;
  parentId: string | null;
  timestamp: string | null;
  entryType: string;
  kind: string;
  role: string | null;
  stopReason: string | null;
  toolName: string | null;
  toolCallId: string | null;
  isError: boolean | null;
  suspiciousSuccessWrapper: boolean;
  title: string;
  text: TruncatedText;
  paths: string[];
  evidence: string[];
  searchText: string;
}

interface BuildOptions {
  scope: "active" | "all";
  requestedLeaf: string | null;
  chunkChars: number;
  maxText: number;
  maxResult: number;
}

interface SessionReport {
  source: JsonObject;
  header: JsonObject;
  selection: JsonObject;
  tree: JsonObject;
  statistics: JsonObject;
  terminalState: JsonObject;
  fileActivity: JsonObject;
  failures: JsonObject[];
  suspiciousSuccessWrappers: JsonObject[];
  timeline: JsonObject[];
  records: SearchRecord[];
}

interface ParsedArgs {
  command: string;
  positionals: string[];
  values: Map<string, string[]>;
  flags: Set<string>;
  legacy: boolean;
}

const KNOWN_COMMANDS = new Set(["help", "overview", "index", "search", "show", "self-test"]);
const VALUE_FLAGS = new Set([
  "--out-dir",
  "--scope",
  "--leaf",
  "--chunk-chars",
  "--max-text",
  "--max-result",
  "--query",
  "--kind",
  "--role",
  "--tool",
  "--path",
  "--limit",
  "--id",
  "--line",
  "--tool-call",
]);
const BOOLEAN_FLAGS = new Set([
  "--json",
  "--regex",
  "--case-sensitive",
  "--failed-only",
  "--raw",
  "--help",
  "-h",
]);

function usage(exitCode = 0): never {
  const text = `Usage:
  pi-session-index.ts overview <session.jsonl|index-dir> [selection options]
  pi-session-index.ts index <session.jsonl> --out-dir <dir> [selection options]
  pi-session-index.ts search <session.jsonl|index-dir> [query/filter options]
  pi-session-index.ts show <session.jsonl|index-dir> (--id <entry-id> | --line <n> | --tool-call <id>) [--raw]
  pi-session-index.ts self-test

Legacy compatibility:
  pi-session-index.ts <session.jsonl> [--out-dir <dir>] [selection options]

Selection options:
  --scope <active|all>   Active inferred/selected path or every persisted entry
  --leaf <entry-id>      Select a specific leaf
  --chunk-chars <n>      Markdown chunk target size (default: 30000)
  --max-text <n>         Maximum indexed text per record (default: 12000)
  --max-result <n>       Maximum failure excerpt (default: 4000)

Search options:
  --query <text>         Literal query; add --regex for a regular expression
  --kind <csv>           user,assistant,tool-call,tool-result,summary,custom,metadata
  --role <csv>           user,assistant,toolResult,...
  --tool <csv>           Tool names
  --path <text>          Match an extracted path
  --failed-only          Keep wrapper errors or embedded failure signals
  --case-sensitive       Preserve query/filter case
  --limit <n>            Result limit (default: 20, maximum: 500)

Show options:
  --id <entry-id>        Show all indexed records for an entry
  --line <n>             Show records from one raw JSONL line
  --tool-call <id>       Show the linked call and result
  --raw                   Include exact parsed raw JSONL objects

Output:
  --json                 Print the complete in-memory report for overview/legacy mode
  --help                 Show help`;
  (exitCode === 0 ? console.log : console.error)(text);
  process.exit(exitCode);
}

function parseArgs(argv: string[]): ParsedArgs {
  if (argv.includes("--help") || argv.includes("-h")) usage(0);
  if (argv.length === 0) usage(2);

  const first = argv[0];
  const legacy = !KNOWN_COMMANDS.has(first) && !first.startsWith("-");
  const command = legacy ? "overview" : first;
  const tokens = legacy ? argv : argv.slice(1);
  const positionals: string[] = [];
  const values = new Map<string, string[]>();
  const flags = new Set<string>();

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (VALUE_FLAGS.has(token)) {
      const value = tokens[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${token} requires a value`);
      const current = values.get(token) ?? [];
      current.push(value);
      values.set(token, current);
      index += 1;
    } else if (BOOLEAN_FLAGS.has(token)) {
      flags.add(token);
    } else if (token.startsWith("-")) {
      throw new Error(`Unknown option: ${token}`);
    } else {
      positionals.push(token);
    }
  }

  return { command, positionals, values, flags, legacy };
}

function option(args: ParsedArgs, name: string): string | null {
  return args.values.get(name)?.at(-1) ?? null;
}

function positiveInteger(value: string | null, flag: string, fallback?: number): number {
  if (value === null && fallback !== undefined) return fallback;
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${flag} requires a positive integer`);
  return parsed;
}

function selectionOptions(args: ParsedArgs, defaultScope: "active" | "all"): BuildOptions {
  const rawScope = option(args, "--scope") ?? defaultScope;
  if (rawScope !== "active" && rawScope !== "all") throw new Error("--scope must be active or all");
  return {
    scope: rawScope,
    requestedLeaf: option(args, "--leaf"),
    chunkChars: positiveInteger(option(args, "--chunk-chars"), "--chunk-chars", 30000),
    maxText: positiveInteger(option(args, "--max-text"), "--max-text", 12000),
    maxResult: positiveInteger(option(args, "--max-result"), "--max-result", 4000),
  };
}

function asObject(value: unknown): JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block) => asObject(block).type === "text")
    .map((block) => String(asObject(block).text ?? ""))
    .join("\n");
}

function truncate(text: unknown, limit: number): TruncatedText {
  const value = String(text ?? "");
  if (value.length <= limit) return { text: value, truncated: false, originalChars: value.length };
  const head = Math.max(1, Math.floor(limit * 0.68));
  const tail = Math.max(1, limit - head);
  return {
    text: `${value.slice(0, head)}\n…[${value.length - limit} chars omitted]…\n${value.slice(-tail)}`,
    truncated: true,
    originalChars: value.length,
  };
}

function cleanLine(value: string): string {
  return value.replace(/\u001b\[[0-9;]*[A-Za-z]/g, "").trim();
}

const EVIDENCE_PATTERN =
  /BUILD (?:SUCCESSFUL|FAILED)|\bPASS\b|\bFAIL(?:ED)?\b|结果：(?:PASS|FAIL|OK)|\bok\s*=\s*(?:true|false)|\btests?\s+\d+|\bpass\s+\d+|\bfail\s+\d+|EXIT(?:_CODE)?\s*=\s*\d+|LOG_STATUS\s*=\s*\w+|COMPILE_EXIT\s*=\s*\d+|REPLAY_OK|VALIDATE_OK|DIFF_CHECK_OK|errorCode|错误码|checksum|制品坐标|Readiness|source snapshot|unsupported effect|constraint failed|Unresolved reference|Command exited with code/i;

function evidenceLines(text: string, limit = 80): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = cleanLine(rawLine);
    if (!line || !EVIDENCE_PATTERN.test(line) || seen.has(line)) continue;
    seen.add(line);
    found.push(line.slice(0, 1000));
    if (found.length >= limit) break;
  }
  return found;
}

function resultSignals(toolName: string | null, isError: boolean, evidence: string[]): ToolSignals {
  if (toolName !== "bash") return { failure: [], success: [], suspiciousSuccessWrapper: false };
  const failure = evidence.filter((line) =>
    /BUILD FAILED|结果：FAIL|\bfail\s+[1-9]\d*|EXIT(?:_CODE)?\s*=\s*[1-9]\d*|COMPILE_EXIT\s*=\s*[1-9]\d*|LOG_STATUS\s*=\s*(?:NOT_SUCCESS|FAILED?)|Command exited with code [1-9]\d*|错误码|errorCode|unsupported effect|constraint failed|Unresolved reference/i.test(line),
  );
  const success = evidence.filter((line) =>
    /BUILD SUCCESSFUL|结果：PASS|\bpass\s+[1-9]\d*|\bfail\s+0|EXIT(?:_CODE)?\s*=\s*0|COMPILE_EXIT\s*=\s*0|LOG_STATUS\s*=\s*SUCCESS|REPLAY_OK|VALIDATE_OK|DIFF_CHECK_OK/i.test(line),
  );
  return { failure, success, suspiciousSuccessWrapper: !isError && failure.length > 0 };
}

const PATH_PATTERN =
  /(?:\/|\.{1,2}\/)?(?:[\w@.+-]+\/)+[\w@.+-]+\.(?:ts|tsx|js|mjs|cjs|kt|java|json|jsonl|md|sql|yaml|yml|xml|gradle|properties|sh|py|rs|go|swift|css|less|scss)/g;

function extractPaths(text: string): string[] {
  return [...new Set(text.match(PATH_PATTERN) ?? [])].sort();
}

function countBy<T>(items: T[], getter: (item: T) => string | null | undefined): JsonObject {
  const result: Record<string, number> = {};
  for (const item of items) {
    const key = getter(item) ?? "<none>";
    result[key] = (result[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(result).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function toolCallsFrom(entry: SourceEntry): JsonObject[] {
  if (entry.type !== "message") return [];
  const message = asObject(entry.message);
  if (message.role !== "assistant" || !Array.isArray(message.content)) return [];
  return message.content.map(asObject).filter((block) => block.type === "toolCall");
}

async function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function parseSession(sessionPath: string): Promise<{
  header: JsonObject;
  entries: SourceEntry[];
  parseErrors: JsonObject[];
  lines: number;
}> {
  const resolved = path.resolve(sessionPath.replace(/^@/, ""));
  if (!fs.existsSync(resolved)) throw new Error(`Session file not found: ${resolved}`);
  if (!fs.statSync(resolved).isFile()) throw new Error(`Not a file: ${resolved}`);

  const entries: SourceEntry[] = [];
  const parseErrors: JsonObject[] = [];
  let header: JsonObject | null = null;
  let lineNumber = 0;
  const input = fs.createReadStream(resolved, { encoding: "utf8" });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });

  for await (const line of lines) {
    lineNumber += 1;
    if (line.trim() === "") continue;
    try {
      const parsed = asObject(JSON.parse(line));
      if (parsed.type === "session" && header === null) header = parsed;
      else entries.push({ ...parsed, type: String(parsed.type ?? "<unknown>"), __line: lineNumber });
    } catch (error) {
      parseErrors.push({ line: lineNumber, error: error instanceof Error ? error.message : String(error) });
    }
  }

  if (header === null) throw new Error("Missing session header");
  return { header, entries, parseErrors, lines: lineNumber };
}

async function buildReport(sessionInput: string, options: BuildOptions): Promise<SessionReport> {
  const sessionPath = path.resolve(sessionInput.replace(/^@/, ""));
  const parsed = await parseSession(sessionPath);
  const { header, entries, parseErrors, lines } = parsed;
  const stat = fs.statSync(sessionPath);

  const byId = new Map<string, SourceEntry>();
  const children = new Map<string | null, string[]>();
  const duplicateIds: string[] = [];
  const missingParents: JsonObject[] = [];

  for (const entry of entries) {
    if (!entry.id) continue;
    if (byId.has(entry.id)) duplicateIds.push(entry.id);
    byId.set(entry.id, entry);
    const key = entry.parentId ?? null;
    const list = children.get(key) ?? [];
    list.push(entry.id);
    children.set(key, list);
  }

  for (const entry of entries) {
    if (entry.parentId !== null && entry.parentId !== undefined && !byId.has(entry.parentId)) {
      missingParents.push({ id: entry.id ?? null, parentId: entry.parentId, line: entry.__line });
    }
  }

  const leaves = entries
    .filter((entry) => entry.id && !children.has(entry.id))
    .map((entry) => {
      const message = asObject(entry.message);
      return {
        id: entry.id,
        line: entry.__line,
        timestamp: entry.timestamp ?? null,
        type: entry.type,
        role: typeof message.role === "string" ? message.role : null,
        stopReason: typeof message.stopReason === "string" ? message.stopReason : null,
      };
    });

  const inferredLeaf = entries.at(-1)?.id ?? null;
  const selectedLeaf = options.requestedLeaf ?? inferredLeaf;
  if (selectedLeaf && !byId.has(selectedLeaf)) throw new Error(`Unknown leaf entry id: ${selectedLeaf}`);

  const pathToRoot = (leafId: string | null): SourceEntry[] => {
    const reversed: SourceEntry[] = [];
    const seen = new Set<string>();
    let cursor = leafId ? byId.get(leafId) : undefined;
    while (cursor) {
      if (!cursor.id) break;
      if (seen.has(cursor.id)) throw new Error(`Cycle detected at entry ${cursor.id}`);
      seen.add(cursor.id);
      reversed.push(cursor);
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }
    return reversed.reverse();
  };

  const activeEntries = pathToRoot(selectedLeaf);
  const selectedEntries = options.scope === "all" ? entries : activeEntries;

  const callIndex = new Map<string, Omit<ToolCallInfo, "result">>();
  for (const entry of entries) {
    for (const call of toolCallsFrom(entry)) {
      const callId = String(call.id ?? "");
      if (!callId) continue;
      const args = asObject(call.arguments);
      const commandText = String(args.command ?? args.cmd ?? "");
      const taskName = typeof args.task_name === "string" ? args.task_name : null;
      const targetPath = typeof args.path === "string" ? args.path : typeof args.file_path === "string" ? args.file_path : null;
      const mutationTask = /patch|write|fix|rewrite|apply|update|create|迁移|修复|落地|扩展|装配|调整|补齐|改造|写入/i.test(`${callId} ${taskName ?? ""}`);
      callIndex.set(callId, {
        callId,
        entryId: entry.id ?? null,
        line: entry.__line,
        timestamp: entry.timestamp ?? null,
        name: String(call.name ?? "<unknown>"),
        arguments: args,
        taskName,
        targetPath,
        command: commandText ? truncate(commandText.replace(/\r?\n/g, " "), 800) : null,
        mentionedPaths: extractPaths(`${targetPath ?? ""}\n${commandText}`),
        bashMutationCandidate: String(call.name ?? "") === "bash" && mutationTask,
      });
    }
  }

  const toolResultIndex = new Map<string, ToolResultInfo>();
  for (const entry of entries) {
    if (entry.type !== "message") continue;
    const message = asObject(entry.message);
    if (message.role !== "toolResult") continue;
    const callId = String(message.toolCallId ?? "");
    const text = contentText(message.content);
    const isError = Boolean(message.isError);
    const toolName = typeof message.toolName === "string" ? message.toolName : null;
    const evidence = evidenceLines(text);
    toolResultIndex.set(callId, {
      entryId: entry.id ?? null,
      line: entry.__line,
      timestamp: entry.timestamp ?? null,
      toolName,
      isError,
      textChars: text.length,
      text: truncate(text, options.maxText),
      evidence,
      signals: resultSignals(toolName, isError, evidence),
      excerpt: truncate(text, options.maxResult),
    });
  }

  const summarizeCall = (call: JsonObject): ToolCallInfo => {
    const callId = String(call.id ?? "");
    const meta = callIndex.get(callId);
    if (!meta) {
      return {
        callId,
        entryId: null,
        line: 0,
        timestamp: null,
        name: String(call.name ?? "<unknown>"),
        arguments: asObject(call.arguments),
        taskName: null,
        targetPath: null,
        command: null,
        mentionedPaths: [],
        bashMutationCandidate: false,
        result: toolResultIndex.get(callId) ?? null,
      };
    }
    return { ...meta, result: toolResultIndex.get(callId) ?? null };
  };

  const timeline: JsonObject[] = [];
  const records: SearchRecord[] = [];

  const addRecord = (record: Omit<SearchRecord, "recordId" | "searchText">): void => {
    const recordId = `${record.line}:${record.kind}:${record.toolCallId ?? record.entryId ?? records.length}`;
    const searchText = [
      record.title,
      record.text.text,
      record.paths.join("\n"),
      record.evidence.join("\n"),
      record.toolName ?? "",
      record.toolCallId ?? "",
      record.entryId ?? "",
    ].join("\n");
    records.push({ ...record, recordId, searchText });
  };

  for (const entry of selectedEntries) {
    const base = {
      line: entry.__line,
      entryId: entry.id ?? null,
      parentId: entry.parentId ?? null,
      timestamp: entry.timestamp ?? null,
      entryType: entry.type,
    };

    if (entry.type === "message") {
      const message = asObject(entry.message);
      const role = String(message.role ?? "<none>");
      if (role === "assistant") {
        const text = truncate(contentText(message.content), options.maxText);
        const calls = toolCallsFrom(entry).map(summarizeCall);
        timeline.push({ ...base, role, stopReason: message.stopReason ?? null, model: message.model ?? null, text, toolCalls: calls });
        if (text.text) {
          addRecord({
            ...base,
            kind: "assistant",
            role,
            stopReason: typeof message.stopReason === "string" ? message.stopReason : null,
            toolName: null,
            toolCallId: null,
            isError: null,
            suspiciousSuccessWrapper: false,
            title: `Assistant ${entry.id ?? `line ${entry.__line}`}`,
            text,
            paths: extractPaths(text.text),
            evidence: evidenceLines(text.text),
          });
        }
        for (const call of calls) {
          const callText = truncate(JSON.stringify(call.arguments), options.maxText);
          addRecord({
            ...base,
            kind: "tool-call",
            role,
            stopReason: typeof message.stopReason === "string" ? message.stopReason : null,
            toolName: call.name,
            toolCallId: call.callId,
            isError: call.result?.isError ?? null,
            suspiciousSuccessWrapper: call.result?.signals.suspiciousSuccessWrapper ?? false,
            title: `${call.name}${call.taskName ? ` · ${call.taskName}` : call.targetPath ? ` · ${call.targetPath}` : ""}`,
            text: callText,
            paths: [...new Set([...call.mentionedPaths, ...extractPaths(callText.text)])],
            evidence: call.result?.evidence ?? [],
          });
        }
      } else if (role === "toolResult") {
        const callId = String(message.toolCallId ?? "");
        const linked = toolResultIndex.get(callId);
        const text = linked?.text ?? truncate(contentText(message.content), options.maxText);
        timeline.push({
          ...base,
          role,
          toolCallId: callId,
          toolName: message.toolName ?? null,
          isError: Boolean(message.isError),
          textChars: linked?.textChars ?? text.originalChars,
          evidence: linked?.evidence ?? [],
          signals: linked?.signals ?? null,
          excerpt: linked?.isError ? linked.excerpt : null,
        });
        addRecord({
          ...base,
          kind: "tool-result",
          role,
          stopReason: null,
          toolName: typeof message.toolName === "string" ? message.toolName : null,
          toolCallId: callId || null,
          isError: Boolean(message.isError),
          suspiciousSuccessWrapper: linked?.signals.suspiciousSuccessWrapper ?? false,
          title: `Tool result · ${String(message.toolName ?? "<unknown>")}`,
          text,
          paths: extractPaths(text.text),
          evidence: linked?.evidence ?? [],
        });
      } else {
        const text = truncate(contentText(message.content), options.maxText);
        timeline.push({ ...base, role, text });
        addRecord({
          ...base,
          kind: role === "user" ? "user" : "metadata",
          role,
          stopReason: null,
          toolName: null,
          toolCallId: null,
          isError: null,
          suspiciousSuccessWrapper: false,
          title: `${role} ${entry.id ?? `line ${entry.__line}`}`,
          text,
          paths: extractPaths(text.text),
          evidence: evidenceLines(text.text),
        });
      }
    } else if (entry.type === "custom_message") {
      const text = truncate(contentText(entry.content), options.maxText);
      timeline.push({ ...base, customType: entry.customType ?? null, display: entry.display ?? null, text });
      addRecord({
        ...base,
        kind: "custom",
        role: "custom",
        stopReason: null,
        toolName: null,
        toolCallId: null,
        isError: null,
        suspiciousSuccessWrapper: false,
        title: `Custom message · ${String(entry.customType ?? "<unknown>")}`,
        text,
        paths: extractPaths(text.text),
        evidence: evidenceLines(text.text),
      });
    } else if (entry.type === "compaction" || entry.type === "branch_summary") {
      const text = truncate(entry.summary ?? "", options.maxText);
      timeline.push({
        ...base,
        fromId: entry.fromId ?? null,
        firstKeptEntryId: entry.firstKeptEntryId ?? null,
        tokensBefore: entry.tokensBefore ?? null,
        retainedTailCount: Array.isArray(entry.retainedTail) ? entry.retainedTail.length : 0,
        summary: text,
      });
      addRecord({
        ...base,
        kind: "summary",
        role: entry.type === "compaction" ? "compactionSummary" : "branchSummary",
        stopReason: null,
        toolName: null,
        toolCallId: null,
        isError: null,
        suspiciousSuccessWrapper: false,
        title: entry.type === "compaction" ? "Compaction summary" : "Branch summary",
        text,
        paths: extractPaths(text.text),
        evidence: evidenceLines(text.text),
      });
    } else {
      const text = truncate(JSON.stringify(entry), options.maxText);
      timeline.push({ ...base, data: entry });
      addRecord({
        ...base,
        kind: entry.type === "custom" ? "custom" : "metadata",
        role: null,
        stopReason: null,
        toolName: null,
        toolCallId: null,
        isError: null,
        suspiciousSuccessWrapper: false,
        title: entry.type,
        text,
        paths: extractPaths(text.text),
        evidence: evidenceLines(text.text),
      });
    }
  }

  const selectedMessages = selectedEntries.filter((entry) => entry.type === "message");
  const assistantEntries = selectedMessages.filter((entry) => asObject(entry.message).role === "assistant");
  const toolResults = selectedMessages.filter((entry) => asObject(entry.message).role === "toolResult");
  const terminalEntries = activeEntries;
  const terminalAssistantEntries = terminalEntries.filter(
    (entry) => entry.type === "message" && asObject(entry.message).role === "assistant",
  );

  const unansweredUserTurns: JsonObject[] = [];
  for (let index = 0; index < terminalEntries.length; index += 1) {
    const entry = terminalEntries[index];
    const message = asObject(entry.message);
    if (entry.type !== "message" || message.role !== "user") continue;
    let answered = false;
    const assistantStops: JsonObject[] = [];
    for (let cursor = index + 1; cursor < terminalEntries.length; cursor += 1) {
      const next = terminalEntries[cursor];
      const nextMessage = asObject(next.message);
      if (next.type === "message" && nextMessage.role === "user") break;
      if (next.type === "message" && nextMessage.role === "assistant") {
        const text = contentText(nextMessage.content).trim();
        assistantStops.push({ id: next.id ?? null, line: next.__line, stopReason: nextMessage.stopReason ?? null, textChars: text.length });
        if (text.length > 0 && nextMessage.stopReason === "stop") answered = true;
      }
    }
    if (!answered) {
      unansweredUserTurns.push({
        id: entry.id ?? null,
        line: entry.__line,
        timestamp: entry.timestamp ?? null,
        text: truncate(contentText(message.content), 1000),
        assistantStops,
      });
    }
  }

  let lastCompleteAnswer: JsonObject | null = null;
  for (const entry of terminalAssistantEntries) {
    const message = asObject(entry.message);
    const text = contentText(message.content).trim();
    if (message.stopReason === "stop" && text) {
      lastCompleteAnswer = { id: entry.id ?? null, line: entry.__line, timestamp: entry.timestamp ?? null, text: truncate(text, options.maxText) };
    }
  }

  const deterministicWrites: JsonObject[] = [];
  const deterministicEdits: JsonObject[] = [];
  const deterministicReads: JsonObject[] = [];
  const bashMutationCandidates: JsonObject[] = [];
  for (const entry of selectedEntries) {
    for (const call of toolCallsFrom(entry)) {
      const summary = summarizeCall(call);
      const row = { path: summary.targetPath, line: entry.__line, callId: summary.callId, resultIsError: summary.result?.isError ?? null };
      if (summary.name === "write" && summary.targetPath) deterministicWrites.push({ ...row, chars: String(summary.arguments.content ?? "").length });
      if (summary.name === "edit" && summary.targetPath) deterministicEdits.push(row);
      if (summary.name === "read" && summary.targetPath) deterministicReads.push(row);
      if (summary.bashMutationCandidate) {
        bashMutationCandidates.push({
          line: entry.__line,
          callId: summary.callId,
          taskName: summary.taskName,
          mentionedPaths: summary.mentionedPaths,
          resultIsError: summary.result?.isError ?? null,
          evidence: summary.result?.evidence ?? [],
        });
      }
    }
  }

  const sumUsage = (sourceEntries: SourceEntry[]): JsonObject => {
    const total = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, costTotal: 0 };
    for (const entry of sourceEntries) {
      const usage = asObject(asObject(entry.message).usage);
      for (const key of ["input", "output", "cacheRead", "cacheWrite", "totalTokens"] as const) {
        total[key] += Number(usage[key] ?? 0);
      }
      total.costTotal += Number(asObject(usage.cost).total ?? 0);
    }
    return total;
  };

  const failureResults = toolResults
    .filter((entry) => Boolean(asObject(entry.message).isError))
    .map((entry) => {
      const message = asObject(entry.message);
      const indexed = toolResultIndex.get(String(message.toolCallId ?? ""));
      return {
        line: entry.__line,
        entryId: entry.id ?? null,
        toolCallId: message.toolCallId ?? null,
        toolName: message.toolName ?? null,
        evidence: indexed?.evidence ?? [],
        excerpt: indexed?.excerpt ?? null,
      };
    });

  const suspiciousSuccessWrappers = toolResults
    .filter((entry) => toolResultIndex.get(String(asObject(entry.message).toolCallId ?? ""))?.signals.suspiciousSuccessWrapper)
    .map((entry) => {
      const message = asObject(entry.message);
      const indexed = toolResultIndex.get(String(message.toolCallId ?? ""));
      return {
        line: entry.__line,
        entryId: entry.id ?? null,
        toolCallId: message.toolCallId ?? null,
        toolName: message.toolName ?? null,
        failureSignals: indexed?.signals.failure ?? [],
        successSignals: indexed?.signals.success ?? [],
      };
    });

  const source = {
    path: sessionPath,
    bytes: stat.size,
    mtimeMs: stat.mtimeMs,
    sha256: await sha256File(sessionPath),
    lines,
    parsedEntries: entries.length + 1,
    parseErrors,
  };
  const headerSummary = {
    type: header.type,
    version: header.version ?? 1,
    id: header.id ?? null,
    timestamp: header.timestamp ?? null,
    cwd: header.cwd ?? null,
    parentSession: header.parentSession ?? null,
  };
  const selection = {
    scope: options.scope,
    requestedLeaf: options.requestedLeaf,
    inferredLeaf,
    selectedLeaf,
    selectedEntryCount: selectedEntries.length,
    activePathEntryCount: activeEntries.length,
    activeLeafIsInferred: options.requestedLeaf === null,
  };
  const tree = {
    entryCount: entries.length,
    duplicateIds,
    missingParents,
    rootEntryIds: children.get(null) ?? [],
    leaves,
  };
  const statistics = {
    entryTypes: countBy(entries, (entry) => entry.type),
    selectedRoles: countBy(selectedMessages, (entry) => String(asObject(entry.message).role ?? "<none>")),
    assistantStopReasons: countBy(assistantEntries, (entry) => String(asObject(entry.message).stopReason ?? "<none>")),
    assistantModels: countBy(assistantEntries, (entry) => String(asObject(entry.message).model ?? "<none>")),
    toolCalls: countBy(selectedEntries.flatMap(toolCallsFrom), (call) => String(call.name ?? "<none>")),
    toolResults: {
      total: toolResults.length,
      errors: toolResults.filter((entry) => Boolean(asObject(entry.message).isError)).length,
      successWrappers: toolResults.filter((entry) => !Boolean(asObject(entry.message).isError)).length,
      suspiciousSuccessWrappers: suspiciousSuccessWrappers.length,
    },
    usage: sumUsage(selectedMessages),
    compactions: selectedEntries.filter((entry) => entry.type === "compaction").length,
    branchSummaries: selectedEntries.filter((entry) => entry.type === "branch_summary").length,
    searchRecords: records.length,
  };
  const lastCompleteLine = lastCompleteAnswer ? Number(lastCompleteAnswer.line ?? 0) : 0;
  const terminalState = {
    scope: "active",
    selectedLeaf,
    lastSelectedEntry: timeline.find((event) => event.entryId === selectedLeaf) ?? null,
    lastCompleteAnswer,
    unansweredUserTurns,
    endedWithCompleteAnswer: Boolean(lastCompleteAnswer) && unansweredUserTurns.every((turn) => Number(turn.line ?? 0) < lastCompleteLine),
  };
  const fileActivity = { deterministicWrites, deterministicEdits, deterministicReads, bashMutationCandidates };

  return {
    source,
    header: headerSummary,
    selection,
    tree,
    statistics,
    terminalState,
    fileActivity,
    failures: failureResults,
    suspiciousSuccessWrappers,
    timeline,
    records,
  };
}

function overviewFrom(report: SessionReport): JsonObject {
  return {
    source: report.source,
    header: report.header,
    selection: report.selection,
    tree: report.tree,
    statistics: report.statistics,
    terminalState: report.terminalState,
    fileActivity: report.fileActivity,
    failures: report.failures,
    suspiciousSuccessWrappers: report.suspiciousSuccessWrappers,
  };
}

function recordMarkdown(record: SearchRecord): string {
  const lines = [
    `## L${record.line} · ${record.timestamp ?? "<no-time>"} · ${record.kind}`,
    "",
    `Entry: \`${record.entryId ?? "<none>"}\` · Parent: \`${record.parentId ?? "<none>"}\` · Record: \`${record.recordId}\``,
  ];
  if (record.toolName) lines.push(`Tool: \`${record.toolName}\`${record.toolCallId ? ` · call \`${record.toolCallId}\`` : ""}`);
  if (record.stopReason) lines.push(`Stop reason: \`${record.stopReason}\``);
  if (record.isError !== null) lines.push(`Wrapper error: \`${record.isError}\``);
  if (record.suspiciousSuccessWrapper) lines.push("Suspicious wrapper success: `true`");
  if (record.paths.length) lines.push(`Paths: ${record.paths.map((value) => `\`${value}\``).join(", ")}`);
  for (const evidence of record.evidence) lines.push(`Evidence: ${evidence}`);
  if (record.text.text) lines.push("", record.text.text);
  return `${lines.join("\n")}\n`;
}

function writeIndex(destinationInput: string, report: SessionReport, options: BuildOptions): JsonObject {
  const destination = path.resolve(destinationInput);
  fs.mkdirSync(destination, { recursive: true });
  const chunkDir = path.join(destination, "chunks");
  fs.rmSync(chunkDir, { recursive: true, force: true });
  fs.mkdirSync(chunkDir, { recursive: true });

  fs.writeFileSync(path.join(destination, "overview.json"), `${JSON.stringify(overviewFrom(report), null, 2)}\n`);
  fs.writeFileSync(path.join(destination, "index.jsonl"), `${report.records.map((record) => JSON.stringify(record)).join("\n")}\n`);
  fs.writeFileSync(path.join(destination, "timeline.jsonl"), `${report.timeline.map((event) => JSON.stringify(event)).join("\n")}\n`);

  const chunks: string[] = [];
  let current = "";
  for (const record of report.records) {
    const rendered = recordMarkdown(record);
    if (current && current.length + rendered.length > options.chunkChars) {
      chunks.push(current);
      current = "";
    }
    current += rendered;
  }
  if (current) chunks.push(current);
  chunks.forEach((chunk, index) => {
    const fileName = `${String(index + 1).padStart(3, "0")}.md`;
    fs.writeFileSync(path.join(chunkDir, fileName), `# Pi session evidence chunk ${index + 1}/${chunks.length}\n\n${chunk}`);
  });

  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: report.source,
    selection: report.selection,
    recordCount: report.records.length,
    timelineCount: report.timeline.length,
    chunkCount: chunks.length,
    files: [
      "overview.json",
      "index.jsonl",
      "timeline.jsonl",
      ...chunks.map((_, index) => `chunks/${String(index + 1).padStart(3, "0")}.md`),
    ],
  };
  fs.writeFileSync(path.join(destination, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return { outputDirectory: destination, ...manifest };
}

function readJsonFile(filePath: string): JsonObject {
  return asObject(JSON.parse(fs.readFileSync(filePath, "utf8")));
}

function readJsonlRecords(filePath: string): SearchRecord[] {
  const text = fs.readFileSync(filePath, "utf8");
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as SearchRecord);
}

function indexStatus(indexDir: string): { manifest: JsonObject; stale: boolean; reasons: string[]; sourcePath: string | null } {
  const manifestPath = path.join(indexDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) throw new Error(`Missing manifest.json in index directory: ${indexDir}`);
  const manifest = readJsonFile(manifestPath);
  const source = asObject(manifest.source);
  const sourcePath = typeof source.path === "string" ? source.path : null;
  const reasons: string[] = [];
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    reasons.push("source-missing");
  } else {
    const stat = fs.statSync(sourcePath);
    if (Number(source.bytes ?? -1) !== stat.size) reasons.push("size-changed");
    if (Math.abs(Number(source.mtimeMs ?? -1) - stat.mtimeMs) > 0.5) reasons.push("mtime-changed");
  }
  return { manifest, stale: reasons.length > 0, reasons, sourcePath };
}

async function loadDataset(input: string, options: BuildOptions): Promise<{
  overview: JsonObject;
  records: SearchRecord[];
  staleIndex: boolean;
  staleReasons: string[];
  sourcePath: string;
  report: SessionReport | null;
}> {
  const resolved = path.resolve(input.replace(/^@/, ""));
  if (!fs.existsSync(resolved)) throw new Error(`Input not found: ${resolved}`);
  if (fs.statSync(resolved).isDirectory()) {
    const status = indexStatus(resolved);
    const recordsPath = path.join(resolved, "index.jsonl");
    const overviewPath = path.join(resolved, "overview.json");
    if (!fs.existsSync(recordsPath) || !fs.existsSync(overviewPath)) throw new Error(`Incomplete index directory: ${resolved}`);
    return {
      overview: readJsonFile(overviewPath),
      records: readJsonlRecords(recordsPath),
      staleIndex: status.stale,
      staleReasons: status.reasons,
      sourcePath: status.sourcePath ?? resolved,
      report: null,
    };
  }
  const report = await buildReport(resolved, options);
  return {
    overview: overviewFrom(report),
    records: report.records,
    staleIndex: false,
    staleReasons: [],
    sourcePath: resolved,
    report,
  };
}

function csvSet(value: string | null, caseSensitive: boolean): Set<string> | null {
  if (!value) return null;
  return new Set(value.split(",").map((item) => (caseSensitive ? item.trim() : item.trim().toLowerCase())).filter(Boolean));
}

function occurrences(text: string, query: string): number {
  if (!query) return 0;
  let count = 0;
  let cursor = 0;
  while (true) {
    const index = text.indexOf(query, cursor);
    if (index < 0) return count;
    count += 1;
    cursor = index + Math.max(1, query.length);
  }
}

function snippet(text: string, query: string, regex: RegExp | null): string {
  if (!text) return "";
  let index = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (regex) {
    regex.lastIndex = 0;
    const match = regex.exec(text);
    index = match?.index ?? -1;
  }
  if (index < 0) return truncate(text.replace(/\s+/g, " "), 320).text;
  const start = Math.max(0, index - 120);
  const end = Math.min(text.length, index + 220);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).replace(/\s+/g, " ")}${end < text.length ? "…" : ""}`;
}

function searchRecords(records: SearchRecord[], args: ParsedArgs): JsonObject[] {
  const caseSensitive = args.flags.has("--case-sensitive");
  const query = option(args, "--query") ?? "";
  const regexMode = args.flags.has("--regex");
  let regex: RegExp | null = null;
  if (regexMode && query) {
    try {
      regex = new RegExp(query, caseSensitive ? "g" : "gi");
    } catch (error) {
      throw new Error(`Invalid --query regular expression: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const kinds = csvSet(option(args, "--kind"), caseSensitive);
  const roles = csvSet(option(args, "--role"), caseSensitive);
  const tools = csvSet(option(args, "--tool"), caseSensitive);
  const pathQuery = option(args, "--path");
  const failedOnly = args.flags.has("--failed-only");

  if (!query && !kinds && !roles && !tools && !pathQuery && !failedOnly) {
    throw new Error("search requires --query or at least one filter");
  }

  const normalize = (value: string): string => (caseSensitive ? value : value.toLowerCase());
  const normalizedQuery = normalize(query);
  const normalizedPath = pathQuery ? normalize(pathQuery) : null;
  const results: Array<{ score: number; record: SearchRecord }> = [];

  for (const record of records) {
    if (kinds && !kinds.has(normalize(record.kind))) continue;
    if (roles && !roles.has(normalize(record.role ?? ""))) continue;
    if (tools && !tools.has(normalize(record.toolName ?? ""))) continue;
    if (failedOnly && !record.isError && !record.suspiciousSuccessWrapper) continue;
    if (normalizedPath && !record.paths.some((item) => normalize(item).includes(normalizedPath))) continue;

    const corpus = normalize(record.searchText);
    let score = 1;
    if (query) {
      if (regex) {
        regex.lastIndex = 0;
        const matches = [...record.searchText.matchAll(regex)];
        if (matches.length === 0) continue;
        score += matches.length * 10;
      } else {
        const count = occurrences(corpus, normalizedQuery);
        if (count === 0) continue;
        score += count * 10;
        if (normalize(record.title).includes(normalizedQuery)) score += 8;
        if (record.paths.some((item) => normalize(item).includes(normalizedQuery))) score += 6;
        if (record.evidence.some((item) => normalize(item).includes(normalizedQuery))) score += 12;
      }
    }
    if (record.isError) score += 5;
    if (record.suspiciousSuccessWrapper) score += 7;
    results.push({ score, record });
  }

  results.sort((a, b) => b.score - a.score || a.record.line - b.record.line || a.record.recordId.localeCompare(b.record.recordId));
  const limit = Math.min(500, positiveInteger(option(args, "--limit"), "--limit", 20));
  return results.slice(0, limit).map(({ score, record }) => ({
    score,
    recordId: record.recordId,
    line: record.line,
    entryId: record.entryId,
    parentId: record.parentId,
    timestamp: record.timestamp,
    kind: record.kind,
    role: record.role,
    toolName: record.toolName,
    toolCallId: record.toolCallId,
    isError: record.isError,
    suspiciousSuccessWrapper: record.suspiciousSuccessWrapper,
    title: record.title,
    paths: record.paths,
    evidence: record.evidence,
    snippet: snippet(record.text.text, query, regex),
  }));
}

async function rawEntriesAtLines(sourcePath: string, wantedLines: Set<number>): Promise<JsonObject[]> {
  if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) return [];
  const found: JsonObject[] = [];
  let lineNumber = 0;
  const input = fs.createReadStream(sourcePath, { encoding: "utf8" });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    lineNumber += 1;
    if (!wantedLines.has(lineNumber)) continue;
    try {
      found.push({ line: lineNumber, entry: JSON.parse(line) });
    } catch (error) {
      found.push({ line: lineNumber, parseError: error instanceof Error ? error.message : String(error), raw: line });
    }
  }
  return found;
}

async function runOverview(args: ParsedArgs): Promise<void> {
  const input = args.positionals[0];
  if (!input) throw new Error("overview requires a session JSONL path or index directory");
  const options = selectionOptions(args, "active");
  const resolved = path.resolve(input.replace(/^@/, ""));

  if (args.legacy && option(args, "--out-dir")) {
    const report = await buildReport(resolved, options);
    const manifest = writeIndex(option(args, "--out-dir")!, report, options);
    console.log(JSON.stringify({ overview: overviewFrom(report), index: manifest }, null, 2));
    return;
  }

  if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
    const status = indexStatus(resolved);
    console.log(JSON.stringify({ ...readJsonFile(path.join(resolved, "overview.json")), indexStatus: status }, null, 2));
    return;
  }

  const report = await buildReport(resolved, options);
  console.log(JSON.stringify(args.flags.has("--json") ? report : overviewFrom(report), null, 2));
}

async function runIndex(args: ParsedArgs): Promise<void> {
  const input = args.positionals[0];
  const outDir = option(args, "--out-dir");
  if (!input) throw new Error("index requires a session JSONL path");
  if (!outDir) throw new Error("index requires --out-dir <dir>");
  const options = selectionOptions(args, "all");
  const report = await buildReport(input, options);
  const manifest = writeIndex(outDir, report, options);
  console.log(JSON.stringify({ overview: overviewFrom(report), index: manifest }, null, 2));
}

async function runSearch(args: ParsedArgs): Promise<void> {
  const input = args.positionals[0];
  if (!input) throw new Error("search requires a session JSONL path or index directory");
  const dataset = await loadDataset(input, selectionOptions(args, "all"));
  const results = searchRecords(dataset.records, args);
  console.log(JSON.stringify({
    source: dataset.sourcePath,
    staleIndex: dataset.staleIndex,
    staleReasons: dataset.staleReasons,
    matched: results.length,
    results,
  }, null, 2));
}

async function runShow(args: ParsedArgs): Promise<void> {
  const input = args.positionals[0];
  if (!input) throw new Error("show requires a session JSONL path or index directory");
  const id = option(args, "--id");
  const rawLine = option(args, "--line");
  const toolCallId = option(args, "--tool-call");
  if (!id && !rawLine && !toolCallId) throw new Error("show requires --id, --line, or --tool-call");
  const line = rawLine ? positiveInteger(rawLine, "--line") : null;
  const dataset = await loadDataset(input, selectionOptions(args, "all"));
  const limit = Math.min(500, positiveInteger(option(args, "--limit"), "--limit", 100));
  const matches = dataset.records.filter((record) => {
    if (id && record.entryId !== id) return false;
    if (line !== null && record.line !== line) return false;
    if (toolCallId && record.toolCallId !== toolCallId) return false;
    return true;
  }).slice(0, limit);
  const raw = args.flags.has("--raw")
    ? await rawEntriesAtLines(dataset.sourcePath, new Set(matches.map((record) => record.line)))
    : undefined;
  console.log(JSON.stringify({
    source: dataset.sourcePath,
    staleIndex: dataset.staleIndex,
    staleReasons: dataset.staleReasons,
    matched: matches.length,
    records: matches,
    ...(raw ? { raw } : {}),
  }, null, 2));
}

async function runSelfTest(): Promise<void> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-session-jsonl-"));
  const sessionPath = path.join(tempDir, "session.jsonl");
  const indexDir = path.join(tempDir, "index");
  const rows = [
    { type: "session", version: 3, id: "session-test", timestamp: "2026-01-01T00:00:00.000Z", cwd: "/tmp/project" },
    { type: "message", id: "00000001", parentId: null, timestamp: "2026-01-01T00:00:01.000Z", message: { role: "user", content: "Fix src/auth.ts" } },
    { type: "message", id: "00000002", parentId: "00000001", timestamp: "2026-01-01T00:00:02.000Z", message: { role: "assistant", content: [{ type: "toolCall", id: "call_1", name: "bash", arguments: { command: "pnpm test src/auth.ts", task_name: "验证认证逻辑" } }], model: "test", stopReason: "toolUse", usage: {} } },
    { type: "message", id: "00000003", parentId: "00000002", timestamp: "2026-01-01T00:00:03.000Z", message: { role: "toolResult", toolCallId: "call_1", toolName: "bash", content: [{ type: "text", text: "FAIL 1\nEXIT_CODE=1\nsrc/auth.ts:10" }], isError: false } },
    { type: "message", id: "00000004", parentId: "00000003", timestamp: "2026-01-01T00:00:04.000Z", message: { role: "assistant", content: [{ type: "text", text: "Implemented the change." }], model: "test", stopReason: "stop", usage: {} } },
    { type: "message", id: "00000005", parentId: "00000004", timestamp: "2026-01-01T00:00:05.000Z", message: { role: "user", content: "Verify it" } },
    { type: "message", id: "00000006", parentId: "00000005", timestamp: "2026-01-01T00:00:06.000Z", message: { role: "assistant", content: [{ type: "text", text: "PASS\nEXIT_CODE=0" }], model: "test", stopReason: "stop", usage: {} } },
    { type: "branch_summary", id: "00000007", parentId: "00000002", timestamp: "2026-01-01T00:00:07.000Z", fromId: "00000006", summary: "Alternate branch for src/auth.ts" },
    { type: "message", id: "00000008", parentId: "00000007", timestamp: "2026-01-01T00:00:08.000Z", message: { role: "user", content: "Unanswered branch request" } },
  ];
  fs.writeFileSync(sessionPath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);

  try {
    const options: BuildOptions = { scope: "all", requestedLeaf: null, chunkChars: 1000, maxText: 12000, maxResult: 4000 };
    const report = await buildReport(sessionPath, options);
    assert.equal((report.tree.leaves as JsonObject[]).length, 2);
    assert.equal(report.suspiciousSuccessWrappers.length, 1);
    assert.equal((report.selection as JsonObject).selectedLeaf, "00000008");
    assert.equal((report.terminalState.unansweredUserTurns as JsonObject[]).length, 2);
    const manifest = writeIndex(indexDir, report, options);
    assert.equal(manifest.recordCount, report.records.length);
    const indexed = readJsonlRecords(path.join(indexDir, "index.jsonl"));
    assert.ok(indexed.some((record) => record.toolCallId === "call_1" && record.kind === "tool-result"));
    assert.ok(indexed.some((record) => record.paths.includes("src/auth.ts")));
    const status = indexStatus(indexDir);
    assert.equal(status.stale, false);
    fs.appendFileSync(sessionPath, "\n");
    assert.equal(indexStatus(indexDir).stale, true);
    console.log(JSON.stringify({ status: "SELF_TEST_OK", records: report.records.length, leaves: 2, unansweredActiveTurns: 2, suspiciousSuccessWrappers: 1 }, null, 2));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  switch (args.command) {
    case "help":
      usage(0);
    case "overview":
      await runOverview(args);
      break;
    case "index":
      await runIndex(args);
      break;
    case "search":
      await runSearch(args);
      break;
    case "show":
      await runShow(args);
      break;
    case "self-test":
      await runSelfTest();
      break;
    default:
      throw new Error(`Unknown command: ${args.command}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
