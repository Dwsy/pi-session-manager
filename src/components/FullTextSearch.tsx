import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Search, X, Loader2, User, Bot, FileText, Globe, ArrowUpDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { invoke } from '../transport';
import { shortenPath } from '../utils/format';
import type { FullTextSearchHit, FullTextSearchResponse, SessionInfo } from '../types';

function getProjectDirName(path: string): string {
  const normalized = path.replace(/\/$/, '');
  const parts = normalized.split('/');
  return parts.length >= 2 ? parts[parts.length - 2] : parts[parts.length - 1] || path;
}

interface FullTextSearchProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectResult: (session: SessionInfo, entryId: string) => void;
}

export default function FullTextSearch({ isOpen, onClose, onSelectResult }: FullTextSearchProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'user' | 'assistant'>('all');
  const [globPattern, setGlobPattern] = useState('');
  const [allHits, setAllHits] = useState<FullTextSearchHit[]>([]);
  const [totalHitsCount, setTotalHitsCount] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hitsPage, setHitsPage] = useState(0);
  const [sortMode, setSortMode] = useState<'score' | 'newest' | 'oldest'>('score');

  const searchTimeoutRef = useRef<NodeJS.Timeout>();
  const inputRef = useRef<HTMLInputElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const pageSize = 20;

  const sortedHits = useMemo(() => {
    const sorted = [...allHits];
    switch (sortMode) {
      case 'newest':
        sorted.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        break;
      case 'oldest':
        sorted.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        break;
      default:
        sorted.sort((a, b) => b.score - a.score);
    }
    return sorted;
  }, [allHits, sortMode]);

  const sessionCounts = useMemo(() => {
    const map = new Map<string, number>();
    allHits.forEach(hit => map.set(hit.session_id, (map.get(hit.session_id) ?? 0) + 1));
    return map;
  }, [allHits]);

  const paginatedHits = useMemo(() => sortedHits.slice(0, (hitsPage + 1) * pageSize), [sortedHits, hitsPage]);

  const remainingToFetch = totalHitsCount - allHits.length;

  const formatRelativeTime = (timestamp: string): string => {
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const minute = 60 * 1000;
      const hour = 60 * minute;
      const day = 24 * hour;

      if (diffMs < minute) return t('common.time.justNow');
      if (diffMs < hour) return t('common.time.minutesAgo', { count: Math.floor(diffMs / minute) });
      if (diffMs < day) return t('common.time.hoursAgo', { count: Math.floor(diffMs / hour) });
      if (diffMs < 7 * day) return t('common.time.daysAgo', { count: Math.floor(diffMs / day) });
      return t('common.time.monthsAgo', { count: Math.floor(diffMs / (30 * day)) });
    } catch {
      return timestamp;
    }
  };

  const performSearch = useCallback(async (searchQuery: string, role: string, glob: string, pageNum: number, append = false) => {
    if (!searchQuery.trim()) {
      setAllHits([]);
      setTotalHitsCount(0);
      setHitsPage(0);
      return;
    }
    setIsSearching(true);
    setError(null);
    try {
      const response = await invoke<FullTextSearchResponse>('full_text_search', {
        query: searchQuery,
        roleFilter: role,
        globPattern: glob || null,
        page: pageNum,
        pageSize: pageSize,
        matchMode: 'any', // default mode; could be made configurable
      });
      setAllHits(prev => append ? [...prev, ...response.hits] : response.hits);
      setTotalHitsCount(response.total_hits);
      setHitsPage(pageNum);
    } catch (err: any) {
      console.error('Full text search failed:', err);
      setError(err as string || 'Search failed');
    } finally {
      setIsSearching(false);
    }
  }, [pageSize]);

  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    const timeout = setTimeout(() => {
      setHitsPage(0);
      performSearch(query, roleFilter, globPattern, 0);
    }, 300);
    searchTimeoutRef.current = timeout;
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [query, roleFilter, globPattern, performSearch]);

  // Memoization cache for highlighted HTML to avoid repeated string processing
  const highlightCache = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    // Clear cache when query changes
    highlightCache.current.clear();
  }, [query]);

  useEffect(() => setHitsPage(0), [sortMode]);

  // Infinite scroll: load more when sentinel enters viewport
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    // Get the scroll container by ID (the element with #search-results-wrapper)
    const scrollContainer = document.getElementById('search-results-wrapper');
    const root = scrollContainer || sentinel.parentElement;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && remainingToFetch > 0 && !isSearching) {
          handleLoadMore();
        }
      },
      {
        root,
        rootMargin: '200px',
        threshold: 0,
      }
    );
    observer.observe(sentinel);
    return () => {
      observer.unobserve(sentinel);
    };
  }, [remainingToFetch, isSearching, hitsPage, query, roleFilter, globPattern]);

  // Auto-focus search input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isOpen]);

  // ESC key to close modal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleLoadMore = () => {
    const nextPage = hitsPage + 1;
    performSearch(query, roleFilter, globPattern, nextPage, true);
  };

  const handleSelect = async (hit: FullTextSearchHit) => {
    try {
      const session = await invoke<SessionInfo>('get_session_by_path', { path: hit.session_path });
      if (session) {
        onSelectResult(session, hit.entry_id);
        onClose();
      }
    } catch (error) {
      console.error('Failed to get session:', error);
    }
  };



  const getSortLabel = () => {
    const keys = {
      score: 'search.fullText.sortScore',
      newest: 'search.fullText.sortNewest',
      oldest: 'search.fullText.sortOldest',
    };
    return t(keys[sortMode]);
  };

  const cycleSort = () => {
    const modes: ('score' | 'newest' | 'oldest')[] = ['score', 'newest', 'oldest'];
    const currentIndex = modes.indexOf(sortMode);
    setSortMode(modes[(currentIndex + 1) % 3]);
  };

  // Escape HTML to prevent XSS
  const escapeHtml = (text: string): string => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  };

  // Highlight query terms in content by wrapping them in <b>
  const highlightContent = (content: string, query: string): string => {
    if (!query.trim()) {
      return escapeHtml(content);
    }
    const escaped = escapeHtml(content);
    const terms = query.trim().split(/\s+/).filter(Boolean);
    let result = escaped;
    terms.forEach(term => {
      if (!term) return;
      const escapedTerm = escapeHtml(term);
      const regex = new RegExp(`(${escapedTerm})`, 'gi');
      result = result.replace(regex, '<b>$1</b>');
    });
    return result;
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[10vh] bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl bg-[#1a1b26] border border-[#2a2b36] rounded-xl shadow-2xl flex flex-col max-h-[80vh] overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b border-[#2a2b36] bg-[#1f2029] relative">
          {/* Close button - top right corner */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-md hover:bg-[#2a2b36] transition-colors flex-shrink-0 z-10"
            aria-label={t('common.close')}
            title={t('common.close')}
          >
            <X className="w-5 h-5 text-muted-foreground hover:text-foreground" />
          </button>

          <div className="relative flex items-center gap-3 mb-4 pr-8">
            <Search className="w-5 h-5 text-blue-400 flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t('search.fullText.placeholder')}
              className="flex-1 bg-transparent border-none p-0 outline-none text-base font-medium text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex bg-[#252636]/50 p-1 rounded-lg border border-[#2a2b36]/50">
              <button
                onClick={() => setRoleFilter('all')}
                className={`px-3 py-1.5 text-xs rounded-md transition-all flex items-center gap-1 ${
                  roleFilter === 'all'
                    ? 'bg-blue-500/90 text-white shadow-md shadow-blue-500/25'
                    : 'text-muted-foreground hover:bg-[#2a2b36] hover:text-foreground'
                }`}
              >
                <div className="flex -space-x-1">
                  <User className="w-3 h-3 flex-shrink-0" />
                  <Bot className="w-3 h-3 flex-shrink-0" />
                </div>
                {t('search.fullText.role.all')}
              </button>
              <button
                onClick={() => setRoleFilter('user')}
                className={`px-3 py-1.5 text-xs rounded-md transition-all flex items-center gap-1 ${
                  roleFilter === 'user'
                    ? 'bg-blue-500/90 text-white shadow-md shadow-blue-500/25'
                    : 'text-muted-foreground hover:bg-[#2a2b36] hover:text-foreground'
                }`}
              >
                <User className="w-3 h-3 flex-shrink-0" />
                {t('search.fullText.role.user')}
              </button>
              <button
                onClick={() => setRoleFilter('assistant')}
                className={`px-3 py-1.5 text-xs rounded-md transition-all flex items-center gap-1 ${
                  roleFilter === 'assistant'
                    ? 'bg-blue-500/90 text-white shadow-md shadow-blue-500/25'
                    : 'text-muted-foreground hover:bg-[#2a2b36] hover:text-foreground'
                }`}
              >
                <Bot className="w-3 h-3 flex-shrink-0" />
                {t('search.fullText.role.assistant')}
              </button>
            </div>
            <div className="flex-1 min-w-[200px] relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70" />
              <input
                type="text"
                value={globPattern}
                onChange={e => setGlobPattern(e.target.value)}
                placeholder={t('search.fullText.globPlaceholder')}
                className="w-full pl-10 pr-4 py-2 bg-[#252636] border border-[#2a2b36]/50 rounded-lg text-sm focus:border-blue-400/50 focus:ring-1 focus:ring-blue-400/20 transition-all placeholder:text-muted-foreground/70"
              />
            </div>
            <button
              onClick={cycleSort}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border font-medium transition-all ${
                sortMode === 'score'
                  ? 'bg-gradient-to-r from-blue-500/10 to-indigo-500/10 border-blue-400/30 text-blue-300 shadow-sm shadow-blue-500/10'
                  : 'bg-[#252636]/50 border-[#2a2b36]/50 text-muted-foreground hover:border-blue-400/30 hover:text-blue-300 hover:bg-blue-500/5'
              }`}
              title={t('search.fullText.sortTitle')}
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              <span className="font-normal">{getSortLabel()}</span>
            </button>
          </div>
        </div>
        <div className="px-4 py-2 border-b border-[#2a2b36]/50 bg-[#1a1b26]/50 flex items-center justify-between text-xs">
          <div className="text-muted-foreground/90 font-medium">
            {isSearching ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400 mr-1.5 inline" />
                {t('search.searching')}
              </>
            ) : totalHitsCount > 0 ? (
              t('search.fullText.resultsFound', { count: totalHitsCount })
            ) : null}
          </div>
          <div className="text-muted-foreground/60 flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 bg-muted/30 border rounded-sm text-xs font-mono tracking-wider uppercase">
              Esc
            </kbd>
            <span>{t('common.close')}</span>
          </div>
        </div>
        <div id="search-results-wrapper" className="flex-1 min-h-0 overflow-hidden bg-[#16161e]/50">
          <div className="flex flex-col p-4 space-y-2 custom-scrollbar">
            {error ? (
              <div className="flex flex-col items-center justify-center p-8 text-center text-red-400 bg-red-500/5 border border-red-500/20 rounded-xl">
                <X className="w-12 h-12 mb-4 opacity-50" />
                <p className="text-sm font-medium">{error}</p>
              </div>
            ) : (isSearching && allHits.length === 0) ? (
              <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground/50">
                <Loader2 className="w-16 h-16 mb-4 animate-spin" />
                <p className="text-lg font-medium">{t('search.searching')}</p>
              </div>
            ) : paginatedHits.length === 0 ? (
              !isSearching && query ? (
                <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground/50">
                  <Search className="w-16 h-16 mb-4 opacity-30" />
                  <p className="text-lg font-medium mb-1">{t('search.noResults')}</p>
                  <p className="text-sm">Try adjusting your search terms or filters</p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground/30">
                  <div className="relative w-20 h-20 mb-6">
                    <Search className="w-20 h-20 opacity-20 absolute inset-0" />
                    <Globe className="w-12 h-12 opacity-40 absolute inset-0 m-auto text-blue-400" />
                  </div>
                  <p className="text-lg font-medium mb-1">{t('search.fullText.startTyping')}</p>
                </div>
              )
            ) : (
              <>
                {paginatedHits.map(hit => {
                  const projectName = getProjectDirName(hit.session_path);
                  const truncatedPath = shortenPath(hit.session_path, 60);
                  const count = sessionCounts.get(hit.session_id) || 1;

                  // Memoized highlight rendering
                  const cacheKey = `${hit.entry_id}|${query}`;
                  let highlightedHtml = highlightCache.current.get(cacheKey);
                  if (highlightedHtml === undefined) {
                    highlightedHtml = highlightContent(hit.content, query);
                    highlightCache.current.set(cacheKey, highlightedHtml);
                  }

                  return (
                    <button
                      key={hit.session_id + hit.entry_id}
                      onClick={() => handleSelect(hit)}
                      className="group relative w-full p-4 rounded-xl border border-transparent hover:border-blue-500/30 hover:bg-blue-500/5 transition-all duration-200 flex flex-col overflow-hidden shadow-sm hover:shadow-md hover:shadow-blue-500/10"
                    >
                      <div className="flex items-center justify-between p-2 bg-blue-500/5 border-b border-blue-500/20 mb-3">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="p-1.5 rounded-lg bg-gradient-to-br from-blue-500/10 to-indigo-500/10 border border-blue-500/20 group-hover:shadow-inner shadow-sm flex-shrink-0">
                            <FileText className="w-4 h-4 text-blue-400" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <h3 
                                className="text-sm font-semibold text-foreground truncate group-hover:text-blue-300 transition-colors"
                                title={hit.session_name ? `Session: ${hit.session_name}\nPath: ${hit.session_path}` : undefined}
                              >
                                {projectName}
                              </h3>
                              {count > 1 && (
                                <span className="px-2 py-0.5 bg-blue-500/15 text-blue-300 text-xs font-bold rounded-full border border-blue-500/30 ml-auto flex-shrink-0">
                                  {count}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {truncatedPath}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground/70 mt-1">
                              <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide ${
                                hit.role === 'user'
                                  ? 'bg-gradient-to-r from-blue-500/20 to-blue-600/20 text-blue-300 border border-blue-500/30'
                                  : 'bg-gradient-to-r from-purple-500/20 to-purple-600/20 text-purple-300 border border-purple-500/30'
                              }`}>
                                {hit.role.toUpperCase()}
                              </span>
                              <span className="font-mono whitespace-nowrap">{formatRelativeTime(hit.timestamp)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="relative pl-10 mb-3">
                        <div className="absolute left-9 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-muted/30 to-transparent group-hover:from-blue-400/30 group-hover:via-blue-400/60" />
                        <div
                          className="text-sm/6 text-muted-foreground leading-relaxed italic line-clamp-3 bg-[#1a1b26]/50 px-3 py-2 rounded-lg backdrop-blur-sm group-hover:bg-blue-500/5 group-hover:text-foreground/90 transition-all fts-snippet"
                          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
                        />
                      </div>
                    </button>
                  );
                })}
                {/* Infinite scroll sentinel */}
                {remainingToFetch > 0 && <div ref={sentinelRef} className="h-1" aria-hidden="true" />}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
