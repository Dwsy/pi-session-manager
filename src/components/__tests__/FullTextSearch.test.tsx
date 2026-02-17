import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FullTextSearch from '../FullTextSearch';
import { invoke } from '@tauri-apps/api/core';
import i18n from '../../i18n';
import { I18nextProvider } from 'react-i18next';

// Mock Tauri core API which is used by transport.ts
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

const mockInvoke = invoke as unknown as ReturnType<typeof vi.fn>;

// Helper to render component with i18n provider
function renderFullTextSearch(open = true) {
  const onClose = vi.fn();
  const onSelectResult = vi.fn();
  render(
    <I18nextProvider i18n={i18n}>
      <FullTextSearch
        isOpen={open}
        onClose={onClose}
        onSelectResult={onSelectResult}
      />
    </I18nextProvider>
  );
  return { onClose, onSelectResult };
}

describe('FullTextSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders directory name as title and truncated path as subtitle', async () => {
    mockInvoke.mockResolvedValue({
      hits: [
        {
          session_id: 's1',
          entry_id: 'e1',
          session_path: '/projects/alpha/session.jsonl',
          session_name: 'Test Session',
          role: 'user',
          timestamp: '2025-01-01T00:00:00Z',
          content: 'This is a test content with highlights',
          score: 1.0,
        },
      ],
      total_hits: 1,
    });

    renderFullTextSearch(true);

    const input = screen.getByPlaceholderText(/search all sessions/i);
    fireEvent.change(input, { target: { value: 'test' } });

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('full_text_search', expect.anything());
    });

    // Title should be directory name 'alpha' extracted from session_path
    expect(screen.getByText('alpha')).toBeInTheDocument();
    // Subtitle should be truncated (or full if under limit) path
    expect(screen.getByText('/projects/alpha/session.jsonl')).toBeInTheDocument();
  });

  it('renders snippet with <b> tags from backend', async () => {
    mockInvoke.mockResolvedValue({
      hits: [
        {
          session_id: 's1',
          entry_id: 'e1',
          session_path: '/x/y/z.jsonl',
          session_name: '',
          role: 'assistant',
          timestamp: '2025-01-01T00:00:00Z',
          content: 'Match here with bold highlight',
          score: 1.0,
        },
      ],
      total_hits: 1,
    });

    renderFullTextSearch(true);

    const input = screen.getByPlaceholderText(/search all sessions/i);
    fireEvent.change(input, { target: { value: 'bold' } });

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalled();
    });

    // Find the snippet container with class fts-snippet
    const snippetContainer = document.querySelector('.fts-snippet');
    expect(snippetContainer).not.toBeNull();
    // The snippet should contain <b>bold</b> in its innerHTML
    expect(snippetContainer?.innerHTML).toContain('<b>bold</b>');
  });

  it('shows loading spinner when search is in progress and no hits yet', async () => {
    // Simulate a pending promise so spinner remains
    mockInvoke.mockReturnValue(new Promise(() => {})); // never resolves

    vi.useFakeTimers();
    renderFullTextSearch(true);

    const input = screen.getByPlaceholderText(/search all sessions/i);
    fireEvent.change(input, { target: { value: 'test' } });

    // Fast-forward the debounce (300ms) so performSearch starts
    await vi.runAllTimersAsync();

    // After debounce, performSearch sets isSearching true; central spinner should be visible
    const spinner = document.querySelector('svg.animate-spin');
    expect(spinner).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('closes modal when ESC key is pressed, even when input is focused', async () => {
    renderFullTextSearch(true);

    // Verify modal is open
    const overlay = document.querySelector('[class*="fixed inset-0"]');
    expect(overlay).toBeInTheDocument();

    // Focus the input
    const input = screen.getByPlaceholderText(/full-text/i);
    input.focus();

    // Press ESC key on window
    fireEvent.keyDown(window, { key: 'Escape' });

    // onClose should have been called
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
