import { Terminal, X } from 'lucide-react'

interface TerminalToggleButtonProps {
  isOpen: boolean
  onToggle: () => void
}

export function TerminalToggleButton({ isOpen, onToggle }: TerminalToggleButtonProps) {
  return (
    <button
      onClick={onToggle}
      className={`p-1 rounded transition-colors ${
        isOpen
          ? 'text-green-400 bg-secondary'
          : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
      }`}
      title={isOpen ? 'Close terminal' : 'Open terminal'}
    >
      {isOpen ? <X className="h-3.5 w-3.5" /> : <Terminal className="h-3.5 w-3.5" />}
    </button>
  )
}

export default TerminalToggleButton
