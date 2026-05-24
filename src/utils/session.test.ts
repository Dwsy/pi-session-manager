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
});
