import { describe, expect, it } from 'bun:test'
import {
  createNote,
  filterNotes,
  notesFromEntries,
  searchNotes,
  signalCount,
} from './notes-core.ts'

describe('createNote', () => {
  it('guesses category and extracts inline tags and labeled lines', () => {
    const note = createNote({
      name: 'Fix login race #auth',
      text: 'fix: serialize session init\n学到: 保持锁粒度\nThe race bit us twice.',
    })
    expect(note.category).toBe('fix')
    expect(note.tags).toContain('auth')
    expect(note.fixes).toEqual(['serialize session init'])
    expect(note.learnings).toEqual(['保持锁粒度'])
    expect(signalCount(note)).toBe(2)
  })

  it('keeps an explicit category over the guess', () => {
    const note = createNote({ name: 'anything', text: 'this would guess pitfall: bug bug bug', category: 'art' })
    expect(note.category).toBe('art')
  })
})

describe('notesFromEntries', () => {
  it('applies tombstones and sorts newest first', () => {
    const entries = [
      { customType: 'pi-note', data: { id: 'a', name: 'first', text: 'one', ts: 1000 } },
      { customType: 'pi-note', data: { id: 'b', name: 'second', text: 'two', ts: 2000 } },
      { customType: 'pi-note-deleted', data: { id: 'a' } },
    ]
    const notes = notesFromEntries(entries)
    expect(notes.map((note) => note.id)).toEqual(['b'])
  })

  it('drops entries without name or text', () => {
    expect(notesFromEntries([{ customType: 'pi-note', data: { id: 'x', name: '', text: '' } }])).toEqual([])
  })
})

describe('filters', () => {
  const notes = notesFromEntries([
    { customType: 'pi-note', data: { id: 'a', name: 'TUI mouse contract', text: 'press selects, click opens #tui', category: 'learning', tags: ['tui'], ts: 1 } },
    { customType: 'pi-note', data: { id: 'b', name: 'Storage layout', text: 'branch entries', category: 'system', ts: 2 } },
  ])

  it('filters by #tag and by category', () => {
    expect(filterNotes(notes, '#tui').map((note) => note.id)).toEqual(['a'])
    expect(filterNotes(notes, 'system').map((note) => note.id)).toEqual(['b'])
    expect(filterNotes(notes, '').length).toBe(2)
  })

  it('searches title, body, category and tags', () => {
    expect(searchNotes(notes, 'mouse').map((note) => note.id)).toEqual(['a'])
    expect(searchNotes(notes, 'branch').map((note) => note.id)).toEqual(['b'])
    expect(searchNotes(notes, 'nothing-here')).toEqual([])
  })
})
