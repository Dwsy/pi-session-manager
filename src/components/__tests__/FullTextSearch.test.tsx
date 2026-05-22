// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import FullTextSearch from '../search/FullTextSearch';
import { fullTextSearchRuntime } from '@/runtime-data/sessionSource';
import i18n from '../../i18n';
import { I18nextProvider } from 'react-i18next';

vi.mock('@/runtime-data/sessionSource', () => ({
  fullTextSearchRuntime: vi.fn(),
  getRuntimeSessionByPath: vi.fn(),
}));

const mockFullTextSearchRuntime = fullTextSearchRuntime as unknown as ReturnType<typeof vi.fn>;

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
    cleanup();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders directory name as title and truncated path as subtitle', async () => {
    mockFullTextSearchRuntime.mockResolvedValue({
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

    vi.useFakeTimers();
    const input = screen.getByPlaceholderText(/search all sessions/i);
    fireEvent.change(input, { target: { value: 'test' } });
    await vi.advanceTimersByTimeAsync(300);
    vi.useRealTimers();

    await waitFor(() => {
      expect(mockFullTextSearchRuntime).toHaveBeenCalledWith(expect.objectContaining({ query: 'test' }));
    });

    expect(screen.getByText('Test Session')).not.toBeNull();
    expect(screen.getByText('/projects/alpha/session.jsonl')).not.toBeNull();
  });

  it('renders snippet with <b> tags from backend', async () => {
    mockFullTextSearchRuntime.mockResolvedValue({
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

    vi.useFakeTimers();
    const input = screen.getByPlaceholderText(/search all sessions/i);
    fireEvent.change(input, { target: { value: 'bold' } });
    await vi.advanceTimersByTimeAsync(300);
    vi.useRealTimers();

    await waitFor(() => {
      expect(mockFullTextSearchRuntime).toHaveBeenCalled();
    });

    const snippetContainer = document.querySelector('.fts-snippet');
    expect(snippetContainer).not.toBeNull();
    expect(snippetContainer?.innerHTML).toContain('<b>bold</b>');
  });

  it('highlights quoted exact phrases as a contiguous match', async () => {
    mockFullTextSearchRuntime.mockResolvedValue({
      hits: [
        {
          session_id: 's1',
          entry_id: 'e1',
          session_path: '/x/y/z.jsonl',
          session_name: '',
          role: 'assistant',
          timestamp: '2025-01-01T00:00:00Z',
          content: 'prefix bold highlight suffix',
          score: 1.0,
        },
      ],
      total_hits: 1,
    });

    renderFullTextSearch(true);

    vi.useFakeTimers();
    const input = screen.getByPlaceholderText(/search all sessions/i);
    fireEvent.change(input, { target: { value: '"bold highlight"' } });
    await vi.advanceTimersByTimeAsync(300);
    vi.useRealTimers();

    await waitFor(() => {
      expect(mockFullTextSearchRuntime).toHaveBeenCalled();
    });

    const snippetContainer = document.querySelector('.fts-snippet');
    expect(snippetContainer).not.toBeNull();
    expect(snippetContainer?.innerHTML).toContain('<b>bold highlight</b>');
  });

  it('shows loading spinner when search is in progress and no hits yet', async () => {
    mockFullTextSearchRuntime.mockReturnValue(new Promise(() => {}));

    vi.useFakeTimers();
    renderFullTextSearch(true);

    const input = screen.getByPlaceholderText(/search all sessions/i);
    fireEvent.change(input, { target: { value: 'test' } });

    await vi.runAllTimersAsync();

    const spinner = document.querySelector('svg.animate-spin');
    expect(spinner).not.toBeNull();

    vi.useRealTimers();
  });

  it('closes modal when ESC key is pressed, even when input is focused', async () => {
    const { onClose } = renderFullTextSearch(true);

    const overlay = document.querySelector('[class*="fixed inset-0"]');
    expect(overlay).not.toBeNull();

    const input = screen.getByPlaceholderText(/search all sessions/i);
    input.focus();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
