import type { ReactNode } from "react";

interface SettingsTabButtonProps {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}

function SettingsTabButton({
  active,
  onClick,
  children,
  className = "",
}: SettingsTabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex-none min-w-[88px] sm:flex-1 sm:min-w-0 min-h-[40px] flex items-center justify-center gap-1.5 px-3 text-xs font-medium rounded-md motion-surface motion-color motion-press focus-ring whitespace-nowrap ${
        active
          ? "bg-info text-white shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      } ${className}`}
    >
      {children}
    </button>
  );
}

export interface SettingsTabsProps<T extends string> {
  items: Array<{
    id: T;
    label: ReactNode;
    icon?: ReactNode;
  }>;
  active: T;
  onChange: (id: T) => void;
  className?: string;
  buttonClassName?: string;
}

export default function SettingsTabs<T extends string>({
  items,
  active,
  onChange,
  className = "",
  buttonClassName = "",
}: SettingsTabsProps<T>) {
  return (
    <div
      className={`flex gap-1 p-1 bg-surface rounded-lg overflow-x-auto [-webkit-overflow-scrolling:touch] ${className}`}
    >
      {items.map((item) => (
        <SettingsTabButton
          key={item.id}
          active={active === item.id}
          onClick={() => onChange(item.id)}
          className={buttonClassName}
        >
          {item.icon}
          {item.label}
        </SettingsTabButton>
      ))}
    </div>
  );
}
