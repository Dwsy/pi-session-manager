import { describe, it, expect } from 'vitest';

import { parseSessionEntriesWithLineCount } from './session';

describe('parseSessionEntriesWithLineCount', () => {
  it('preserves raw Pi tree-advancing entries and their parent chain', () => {
    const content = [
      JSON.stringify({
        type: 'message',
        id: 'user-1',
        timestamp: '2026-04-09T10:00:00Z',
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'hello' }],
        },
      }),
      JSON.stringify({
        type: 'label',
        id: 'label-1',
        parentId: 'user-1',
        targetId: 'user-1',
        label: 'Pinned',
        timestamp: '2026-04-09T10:01:00Z',
      }),
      JSON.stringify({
        type: 'session_info',
        id: 'info-1',
        parentId: 'label-1',
        name: 'Session title',
        timestamp: '2026-04-09T10:02:00Z',
      }),
      JSON.stringify({
        type: 'model_change',
        id: 'model-1',
        parentId: 'info-1',
        provider: 'openai',
        modelId: 'gpt-test',
        timestamp: '2026-04-09T10:03:00Z',
      }),
      JSON.stringify({
        type: 'thinking_level_change',
        id: 'thinking-1',
        parentId: 'model-1',
        thinkingLevel: 'high',
        timestamp: '2026-04-09T10:04:00Z',
      }),
      JSON.stringify({
        type: 'message',
        id: 'assistant-1',
        parentId: 'thinking-1',
        timestamp: '2026-04-09T10:05:00Z',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'done' }],
        },
      }),
    ].join('\n');

    const { entries, lineCount } = parseSessionEntriesWithLineCount(content);
    const entryIds = new Set(entries.map((entry) => entry.id));

    expect(lineCount).toBe(6);
    expect(entries.map((entry) => entry.type)).toEqual([
      'message',
      'label',
      'session_info',
      'model_change',
      'thinking_level_change',
      'message',
    ]);
    expect(entries.find((entry) => entry.id === 'label-1')).toMatchObject({
      targetId: 'user-1',
      label: 'Pinned',
    });
    expect(entries.find((entry) => entry.id === 'assistant-1')?.parentId).toBe(
      'thinking-1',
    );
    expect(
      entries.every((entry) => !entry.parentId || entryIds.has(entry.parentId)),
    ).toBe(true);
  });

  it('links raw Codex function call output to its tool call id', () => {
    const content = [
      JSON.stringify({
        type: 'response_item',
        payload: {
          type: 'function_call',
          call_id: 'call_1',
          name: 'read_file',
          arguments: { path: 'src/auth.ts' },
        },
      }),
      JSON.stringify({
        type: 'response_item',
        payload: {
          type: 'function_call_output',
          call_id: 'call_1',
          output: 'file contents',
        },
      }),
    ].join('\n');

    const { entries } = parseSessionEntriesWithLineCount(content);

    expect(entries[0].message?.content[0]).toMatchObject({
      type: 'toolCall',
      id: 'call_1',
      name: 'read_file',
      arguments: { path: 'src/auth.ts' },
    });
    expect(entries[1].message).toMatchObject({
      role: 'toolResult',
      toolCallId: 'call_1',
      content: [{ type: 'text', text: 'file contents' }],
    });
  });

  it('maps raw Codex event messages and message items without payload type', () => {
    const content = [
      JSON.stringify({
        type: 'event_msg',
        timestamp: 1737300001.0,
        payload: {
          type: 'user_message',
          message: 'Fix the bug',
        },
      }),
      JSON.stringify({
        type: 'event_msg',
        timestamp: 1737300002.0,
        payload: {
          type: 'agent_reasoning',
          text: 'Need to inspect the failing path',
        },
      }),
      JSON.stringify({
        type: 'response_item',
        timestamp: 1737300003.0,
        payload: {
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Fixed.' }],
        },
      }),
    ].join('\n');

    const { entries } = parseSessionEntriesWithLineCount(content);

    expect(entries).toHaveLength(3);
    expect(entries[0].message).toMatchObject({
      role: 'user',
      content: [{ type: 'text', text: 'Fix the bug' }],
    });
    expect(entries[1].message).toMatchObject({
      role: 'assistant',
      content: [{ type: 'thinking', thinking: 'Need to inspect the failing path' }],
    });
    expect(entries[2].message).toMatchObject({
      role: 'assistant',
      content: [{ type: 'text', text: 'Fixed.' }],
    });
    expect(entries.map((entry) => entry.timestamp)).toEqual([
      '2025-01-19T15:20:01.000Z',
      '2025-01-19T15:20:02.000Z',
      '2025-01-19T15:20:03.000Z',
    ]);
  });

  it('maps raw Claude Code tool_result content to a linked tool result message', () => {
    const content = JSON.stringify({
      type: 'user',
      uuid: 'tool-result-1',
      timestamp: '2026-04-09T10:00:00Z',
      message: {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_1',
            content: 'file contents',
            is_error: false,
          },
        ],
      },
    });

    const { entries } = parseSessionEntriesWithLineCount(content);

    expect(entries).toHaveLength(1);
    expect(entries[0].message).toMatchObject({
      role: 'toolResult',
      toolCallId: 'toolu_1',
      isError: false,
      content: [{ type: 'text', text: 'file contents' }],
    });
  });

  it('groups a fragmented Claude Code assistant turn (same message.id) into one message', () => {
    const responseId = 'resp_0e2c4a75be94873b016a1339ced2d48191a9f7c4';
    const content = [
      JSON.stringify({
        type: 'user',
        uuid: 'u1',
        sessionId: 'cc-1',
        timestamp: '2026-04-09T10:00:00Z',
        message: { role: 'user', content: 'Fix auth' },
      }),
      JSON.stringify({
        type: 'assistant',
        uuid: 'a-thinking',
        parentUuid: 'u1',
        timestamp: '2026-04-09T10:00:01Z',
        message: {
          id: responseId,
          role: 'assistant',
          model: 'claude-sonnet-4',
          content: [{ type: 'thinking', thinking: 'Let me check the logs.' }],
        },
      }),
      JSON.stringify({
        type: 'assistant',
        uuid: 'a-text',
        parentUuid: 'a-thinking',
        timestamp: '2026-04-09T10:00:02Z',
        message: {
          id: responseId,
          role: 'assistant',
          model: 'claude-sonnet-4',
          content: [{ type: 'text', text: 'Reading the auth file.' }],
        },
      }),
      JSON.stringify({
        type: 'assistant',
        uuid: 'a-tool-1',
        parentUuid: 'a-text',
        timestamp: '2026-04-09T10:00:03Z',
        message: {
          id: responseId,
          role: 'assistant',
          model: 'claude-sonnet-4',
          content: [{ type: 'tool_use', id: 'toolu_1', name: 'read_file', input: { path: 'src/auth.ts' } }],
        },
      }),
      JSON.stringify({
        type: 'assistant',
        uuid: 'a-tool-2',
        parentUuid: 'a-tool-1',
        timestamp: '2026-04-09T10:00:04Z',
        message: {
          id: responseId,
          role: 'assistant',
          model: 'claude-sonnet-4',
          content: [{ type: 'tool_use', id: 'toolu_2', name: 'bash', input: { command: 'npm test' } }],
        },
      }),
    ].join('\n');

    const { entries } = parseSessionEntriesWithLineCount(content);

    // user + 1 grouped assistant message (not 4 separate assistant entries)
    const assistantEntries = entries.filter((e) => e.message?.role === 'assistant');
    expect(assistantEntries).toHaveLength(1);

    const assistant = assistantEntries[0];
    expect(assistant.id).toBe('a-thinking');
    expect(assistant.message?.responseId).toBe(responseId);
    expect(assistant.message?.model).toBe('claude-sonnet-4');

    const blockTypes = assistant.message?.content.map((c) => c.type);
    expect(blockTypes).toEqual(['thinking', 'text', 'toolCall', 'toolCall']);

    const toolCalls = assistant.message?.content.filter((c) => c.type === 'toolCall');
    expect(toolCalls?.map((c) => c.id)).toEqual(['toolu_1', 'toolu_2']);
    expect(toolCalls?.map((c) => c.name)).toEqual(['read_file', 'bash']);
  });

  it('keeps Claude Code tool_result entries separate and still linked via toolCallId after grouping', () => {
    const responseId = 'resp_grouped_with_tools';
    const content = [
      JSON.stringify({
        type: 'assistant',
        uuid: 'a1',
        timestamp: '2026-04-09T10:00:00Z',
        message: {
          id: responseId,
          role: 'assistant',
          model: 'claude-sonnet-4',
          content: [{ type: 'tool_use', id: 'toolu_1', name: 'read_file', input: { path: 'a.ts' } }],
        },
      }),
      JSON.stringify({
        type: 'assistant',
        uuid: 'a2',
        parentUuid: 'a1',
        timestamp: '2026-04-09T10:00:01Z',
        message: {
          id: responseId,
          role: 'assistant',
          model: 'claude-sonnet-4',
          content: [{ type: 'tool_use', id: 'toolu_2', name: 'bash', input: { command: 'ls' } }],
        },
      }),
      JSON.stringify({
        type: 'user',
        uuid: 'r1',
        parentUuid: 'a2',
        timestamp: '2026-04-09T10:00:02Z',
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'file a', is_error: false }],
        },
      }),
      JSON.stringify({
        type: 'user',
        uuid: 'r2',
        parentUuid: 'r1',
        timestamp: '2026-04-09T10:00:03Z',
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'toolu_2', content: 'ls out', is_error: false }],
        },
      }),
    ].join('\n');

    const { entries } = parseSessionEntriesWithLineCount(content);

    const assistant = entries.filter((e) => e.message?.role === 'assistant');
    const toolResults = entries.filter((e) => e.message?.role === 'toolResult');
    expect(assistant).toHaveLength(1);
    expect(toolResults).toHaveLength(2);
    expect(toolResults.map((e) => e.message?.toolCallId)).toEqual(['toolu_1', 'toolu_2']);
  });

  it('does not merge assistant entries that lack a shared message.id', () => {
    const content = [
      JSON.stringify({
        type: 'assistant',
        uuid: 'a1',
        timestamp: '2026-04-09T10:00:00Z',
        message: { role: 'assistant', model: 'm', content: [{ type: 'text', text: 'one' }] },
      }),
      JSON.stringify({
        type: 'assistant',
        uuid: 'a2',
        parentUuid: 'a1',
        timestamp: '2026-04-09T10:00:01Z',
        message: { role: 'assistant', model: 'm', content: [{ type: 'text', text: 'two' }] },
      }),
    ].join('\n');

    const { entries } = parseSessionEntriesWithLineCount(content);
    expect(entries.filter((e) => e.message?.role === 'assistant')).toHaveLength(2);
  });

  it('groups a fragmented Codex assistant turn (function_calls + message) into one message', () => {
    const content = [
      JSON.stringify({
        type: 'event_msg',
        timestamp: 1737300001.0,
        payload: { type: 'user_message', message: 'Fix auth' },
      }),
      JSON.stringify({
        type: 'response_item',
        timestamp: 1737300002.0,
        payload: {
          type: 'function_call',
          call_id: 'call_1',
          name: 'shell',
          arguments: { command: ['ls'] },
        },
      }),
      JSON.stringify({
        type: 'response_item',
        timestamp: 1737300003.0,
        payload: {
          type: 'function_call',
          call_id: 'call_2',
          name: 'read_file',
          arguments: { path: 'src/auth.ts' },
        },
      }),
      JSON.stringify({
        type: 'response_item',
        timestamp: 1737300004.0,
        payload: {
          type: 'function_call_output',
          call_id: 'call_1',
          output: 'file list',
        },
      }),
      JSON.stringify({
        type: 'response_item',
        timestamp: 1737300005.0,
        payload: {
          type: 'function_call_output',
          call_id: 'call_2',
          output: 'file contents',
        },
      }),
      JSON.stringify({
        type: 'response_item',
        timestamp: 1737300006.0,
        payload: {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Fixed the auth module.' }],
        },
      }),
    ].join('\n');

    const { entries } = parseSessionEntriesWithLineCount(content);

    const assistants = entries.filter((e) => e.message?.role === 'assistant');
    const toolResults = entries.filter((e) => e.message?.role === 'toolResult');
    // Two tool-call fragments + the final answer collapse into one assistant message.
    expect(assistants).toHaveLength(1);
    // toolResult entries stay separate and still linked.
    expect(toolResults).toHaveLength(2);
    expect(toolResults.map((e) => e.message?.toolCallId).sort()).toEqual(['call_1', 'call_2']);

    const assistant = assistants[0];
    const blockTypes = assistant.message?.content.map((c) => c.type);
    expect(blockTypes).toEqual(['toolCall', 'toolCall', 'text']);
    const toolCalls = assistant.message?.content.filter((c) => c.type === 'toolCall');
    expect(toolCalls?.map((c) => c.id).sort()).toEqual(['call_1', 'call_2']);
    const text = assistant.message?.content.find((c) => c.type === 'text');
    expect(text).toMatchObject({ text: 'Fixed the auth module.' });
  });

  it('does not merge Codex assistant text messages that follow each other without tool calls', () => {
    const content = [
      JSON.stringify({
        type: 'response_item',
        timestamp: 1737300001.0,
        payload: { role: 'assistant', content: [{ type: 'output_text', text: 'one' }] },
      }),
      JSON.stringify({
        type: 'response_item',
        timestamp: 1737300002.0,
        payload: { role: 'assistant', content: [{ type: 'output_text', text: 'two' }] },
      }),
    ].join('\n');

    const { entries } = parseSessionEntriesWithLineCount(content);
    expect(entries.filter((e) => e.message?.role === 'assistant')).toHaveLength(2);
  });
});
