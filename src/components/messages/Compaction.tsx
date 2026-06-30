import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import MarkdownContent from '@/components/ui/MarkdownContent'
import { formatTokens } from '@/utils/format'
import { useClipboard } from '@/hooks/useClipboard'
import { Copy, Check } from 'lucide-react'

interface CompactionProps {
  tokensBefore?: number
  summary?: string
  searchQuery?: string
}

export default function Compaction({ tokensBefore, summary, searchQuery = '' }: CompactionProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const { copyText } = useClipboard()
  const contentRef = useRef<HTMLDivElement>(null)
  const isSelecting = useRef(false)

  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = document.getSelection()
      if (selection && selection.toString().length > 0 && contentRef.current) {
        isSelecting.current = contentRef.current.contains(selection.anchorNode)
      } else {
        isSelecting.current = false
      }
    }

    document.addEventListener('selectionchange', handleSelectionChange)
    return () => document.removeEventListener('selectionchange', handleSelectionChange)
  }, [])

  useEffect(() => {
    if (searchQuery.trim() && summary && summary.toLowerCase().includes(searchQuery.toLowerCase())) {
      setExpanded(true)
    }
  }, [searchQuery, summary])

  const handleToggle = () => {
    if (!isSelecting.current) {
      setExpanded(!expanded)
    }
  }

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (summary) {
      try {
        await copyText(summary)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch (err) {
        console.error('Failed to copy compaction summary:', err)
      }
    }
  }

  const handleCopyClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    handleCopy(e)
  }

  return (
    <div
      className={`compaction ${expanded ? 'expanded' : ''}`}
      onClick={handleToggle}
    >
      <div className="compaction-header">
        <div className="compaction-label">{t('components.compaction.label')}</div>
        <div className="compaction-collapsed">
          {t('components.compaction.collapsed', { tokens: formatTokens(tokensBefore || 0) })}
        </div>
      </div>
      <div className="compaction-content" ref={contentRef}>
        <div className="compaction-content-header">
          <span>{t('components.compaction.content', { tokens: formatTokens(tokensBefore || 0) })}</span>
          {summary && (
            <button
              onClick={handleCopyClick}
              className="compaction-copy-button"
              aria-label={copied ? t('components.codeBlock.copied') : t('components.codeBlock.copy')}
              title={copied ? t('components.codeBlock.copied') : t('components.codeBlock.copy')}
            >
              {copied ? (
                <Check className="w-4 h-4" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
              <span className="compaction-copy-text">
                {copied ? t('components.codeBlock.copied') : t('components.codeBlock.copy')}
              </span>
            </button>
          )}
        </div>
        {summary ? <MarkdownContent content={summary} searchQuery={searchQuery} /> : null}
      </div>
    </div>
  )
}
