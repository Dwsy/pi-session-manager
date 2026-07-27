import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

interface ToolSectionHeaderProps {
  label: string
  text?: string
  copyText: (text: string) => Promise<void>
  copyLabel?: string
  copiedLabel?: string
}

export default function ToolSectionHeader({
  label,
  text,
  copyText,
  copyLabel = `Copy ${label.toLowerCase()}`,
  copiedLabel = 'Copied',
}: ToolSectionHeaderProps) {
  const [copied, setCopied] = useState(false)
  const canCopy = Boolean(text)

  const handleCopy = async () => {
    if (!text) return
    await copyText(text)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="tool-output-header">
      <span className="tool-output-label">{label}</span>
      {canCopy ? (
        <button
          type="button"
          className="tool-copy-button"
          onClick={() => void handleCopy()}
          aria-label={copied ? copiedLabel : copyLabel}
          title={copied ? copiedLabel : copyLabel}
        >
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        </button>
      ) : null}
    </div>
  )
}
