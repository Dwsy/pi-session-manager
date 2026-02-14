import React, { useState, useEffect, useMemo } from 'react';
import { invoke } from '../transport';
import { useTranslation } from 'react-i18next';
import { X, Terminal, Wrench } from 'lucide-react';
import MarkdownContent from './MarkdownContent';
import type { SessionEntry } from '../types';

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

  // 从会话 entries 中提取工具使用情况
  const toolUsages = useMemo(() => {
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

    // 按使用次数降序排序
    usages.sort((a, b) => b.count - a.count);
    return usages;
  }, [entries]);

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
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface-dark rounded-lg shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden border border-border">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab('prompt')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'prompt'
                  ? 'bg-surface text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-surface/50'
              }`}
            >
              <Terminal className="w-4 h-4" />
              {t('common.systemPrompt.systemPrompt', 'System Prompt')}
            </button>
            <button
              onClick={() => setActiveTab('tools')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'tools'
                  ? 'bg-surface text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-surface/50'
              }`}
            >
              <Wrench className="w-4 h-4" />
              {t('common.systemPrompt.toolsUsed', 'Tools Used')}
              <span className="text-xs bg-surface-dark text-muted-foreground px-2 py-0.5 rounded-full">
                {toolUsages.length}
              </span>
            </button>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors p-1"
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
            <div className="bg-surface rounded-lg p-4">
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
                      className="bg-surface rounded-lg border border-border-hover p-3 flex items-center justify-between"
                    >
                      <span className="font-medium text-foreground">{tool.name}</span>
                      <span className="text-xs bg-surface-dark text-muted-foreground px-2 py-1 rounded-full">
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
