import { ArrowDown } from "lucide-react";

export interface NewMessagesButtonProps {
  title: string;
  label: string;
  onClick: () => void;
}

export default function NewMessagesButton({
  title,
  label,
  onClick,
}: NewMessagesButtonProps) {
  return (
    <button
      onClick={onClick}
      className="absolute bottom-4 right-14 z-10 flex items-center gap-1 rounded-full bg-secondary hover:bg-secondary-hover text-xs text-foreground px-3 py-2 shadow-lg transition-colors"
      title={title}
    >
      <ArrowDown className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
