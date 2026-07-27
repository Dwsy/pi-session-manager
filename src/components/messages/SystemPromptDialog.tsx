import React, { useState, useEffect, useMemo } from 'react';
import { invoke } from '@/transport';
import { useTranslation } from 'react-i18next';
import { X, Terminal, Wrench } from 'lucide-react';
import MarkdownContent from '@/components/ui/MarkdownContent';
import type { SessionEntry } from '@/types';

interface SystemPromptDialogProps {
  isOpen: boolean;
  onClose: () => void;
  entries?: SessionEntry[];
  sessionPath?: string;
}

interface ToolUsage {
  name: string;
  count: number;
}

type TabType = 'prompt' | 'tools';

const SystemPromptDialog: React.FC<SystemPromptDialogProps> = ({ isOpen, onClose, entries = [], sessionPath }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabType>('prompt');
  const [systemPrompt, setSystemPrompt] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  // Extract tool usage from session entries
  const toolUsages = useMemo(() => {
    if (!isOpen || entries.length === 0) {
      return [];
    }

    const toolMap = new Map<string, number>();

    for (const entry of entries) {
      if (entry.type === 'message' && entry.message?.role === 'assistant') {
        const content = entry.message.content || [];
        for (const block of content) {
          if (block.type === 'toolCall' && block.name) {
            toolMap.set(block.name, (toolMap.get(block.name) || 0) + 1);
          }
        }
      }
    }

    const usages: ToolUsage[] = [];
    for (const [name, count] of toolMap) {
      usages.push({ name, count });
    }

    // Sort by usage count in descending order
    usages.sort((a, b) => b.count - a.count);
    return usages;
  }, [entries, isOpen]);

  useEffect(() => {
    if (isOpen) {
      loadSystemPrompt();
    }
  }, [isOpen, sessionPath]);

  const loadSystemPrompt = async () => {
    setLoading(true);
    try {
      const prompt = sessionPath
        ? await invoke<string>('get_session_system_prompt', { path: sessionPath })
        : await invoke<string>('get_system_prompt');
      setSystemPrompt(prompt);
    } catch (error) {
      console.error('Failed to load system prompt:', error);
      setSystemPrompt('');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="system-prompt-title" className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex overflow-hidden rounded-md border border-border">
            <button
              onClick={() => setActiveTab('prompt')}
              aria-pressed={activeTab === 'prompt'}
              className={`focus-ring flex items-center gap-2 border-r border-border px-3 py-2 text-sm font-medium last:border-r-0 ${
                activeTab === 'prompt'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Terminal className="w-4 h-4" />
              <span id="system-prompt-title">{t('common.systemPrompt.systemPrompt', 'System Prompt')}</span>
            </button>
            <button
              onClick={() => setActiveTab('tools')}
              aria-pressed={activeTab === 'tools'}
              className={`focus-ring flex items-center gap-2 border-r border-border px-3 py-2 text-sm font-medium last:border-r-0 ${
                activeTab === 'tools'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Wrench className="w-4 h-4" />
              {t('common.systemPrompt.toolsUsed', 'Tools Used')}
              <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                {toolUsages.length}
              </span>
            </button>
          </div>
          <button
            onClick={onClose}
            className="focus-ring rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={t('common.close', 'Close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading && activeTab === 'prompt' ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-muted-foreground">{t('common.loading', 'Loading...')}</div>
            </div>
          ) : activeTab === 'prompt' ? (
            <div className="rounded-md border border-border bg-background p-4">
              {systemPrompt ? (
                <MarkdownContent content={systemPrompt} className="text-sm" />
              ) : (
                <div className="text-muted-foreground text-sm">
                  {t('common.systemPrompt.noPrompt', 'No system prompt configured')}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {toolUsages.length === 0 ? (
                <div className="text-muted-foreground text-sm py-4 text-center">
                  {t('common.systemPrompt.noToolsUsed', 'No tools used in this session')}
                </div>
              ) : (
                <div className="grid gap-2">
                  {toolUsages.map((tool) => (
                    <div
                      key={tool.name}
                      className="flex items-center justify-between border-b border-border p-3 last:border-b-0"
                    >
                      <span className="font-medium text-foreground">{tool.name}</span>
                      <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                        {tool.count} {t('common.systemPrompt.calls', 'calls')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SystemPromptDialog;
