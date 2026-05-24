import {
  BookOpen,
  Boxes,
  ChartNoAxesColumn,
  Columns3,
  FileText,
  FolderOpen,
  Grid3X3,
  LayoutDashboard,
  ListTodo,
  NotebookTabs,
  PanelsTopLeft,
  Table2,
  type LucideIcon,
} from "lucide-react";

const appViewIconMap = {
  "book-open": BookOpen,
  boxes: Boxes,
  columns3: Columns3,
  "chart-column": ChartNoAxesColumn,
  "file-text": FileText,
  "folder-open": FolderOpen,
  grid: Grid3X3,
  "layout-dashboard": LayoutDashboard,
  "list-todo": ListTodo,
  notebook: NotebookTabs,
  panels: PanelsTopLeft,
  table: Table2,
} satisfies Record<string, LucideIcon>;

export interface AppViewIconProps {
  icon?: string;
  className?: string;
}

export default function AppViewIcon({
  icon,
  className = "h-3.5 w-3.5",
}: AppViewIconProps) {
  const Icon = icon ? appViewIconMap[icon as keyof typeof appViewIconMap] : null;
  const ResolvedIcon = Icon ?? LayoutDashboard;
  return <ResolvedIcon className={className} aria-hidden="true" />;
}
