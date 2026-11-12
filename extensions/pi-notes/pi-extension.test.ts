import { describe, expect, it } from 'bun:test'
import piExtension from './pi-extension.ts'

interface FakeEntry {
  customType: string
  data: unknown
}

function makeHarness() {
  const entries: FakeEntry[] = []
  const commands = new Map<string, any>()
  const tools = new Map<string, any>()
  const notices: string[] = []
  const pi = {
    registerCommand: (name: string, def: any) => commands.set(name, def),
    registerTool: (def: any) => tools.set(def.name, def),
    appendEntry: (customType: string, data: unknown) => entries.push({ customType, data }),
  }
  const ctx = {
    mode: 'rpc',
    sessionManager: { getBranch: () => entries },
    ui: { notify: (message: string) => notices.push(message) },
  }
  piExtension(pi as any)
  return { entries, commands, tools, notices, ctx }
}

describe('pi-extension wiring', () => {
  it('registers the command and all three tools', () => {
    const { commands, tools } = makeHarness()
    expect(commands.has('notes')).toBe(true)
    expect([...tools.keys()].sort()).toEqual(['notes_list', 'notes_save', 'notes_search'])
  })

  it('saves a note and finds it through the tools', async () => {
    const { entries, tools, ctx } = makeHarness()
    const saved = await tools.get('notes_save').execute('t1', { name: 'Fix login race', text: 'fix: serialize init #auth' }, null, null, ctx)
    expect(saved.content[0].text).toContain('saved')
    expect(entries).toHaveLength(1)

    const listed = await tools.get('notes_list').execute('t2', {}, null, null, ctx)
    expect(listed.content[0].text).toContain('Fix login race')
    const found = await tools.get('notes_search').execute('t3', { query: 'serialize' }, null, null, ctx)
    expect(found.details.count).toBe(1)
  })

  it('handles /notes save and /notes delete entries', async () => {
    const { entries, commands, ctx } = makeHarness()
    const handler = commands.get('notes').handler
    await handler('save Title :: some content', ctx)
    expect(entries.at(-1)?.customType).toBe('pi-note')
    const id = (entries.at(-1)!.data as { id: string }).id

    await handler(`delete ${id}`, ctx)
    expect(entries.at(-1)?.customType).toBe('pi-note-deleted')
  })

  it('falls back to a notify outside the TUI', async () => {
    const { commands, notices, ctx } = makeHarness()
    await commands.get('notes').handler('list', ctx)
    expect(notices.at(-1)).toContain('Interactive panel needs the TUI')
  })
})
