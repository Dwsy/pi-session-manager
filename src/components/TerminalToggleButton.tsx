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
          ? 'text-green-400 bg-[#2c2d3b]' 
          : 'text-[#6a6f85] hover:text-white hover:bg-[#2c2d3b]'
      }`}
      title={isOpen ? 'Close terminal' : 'Open terminal'}
    >
      {isOpen ? <X className="h-3.5 w-3.5" /> : <Terminal className="h-3.5 w-3.5" />}
    </button>
  )
}

export default TerminalToggleButton
