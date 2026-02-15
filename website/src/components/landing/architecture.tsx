import { Monitor, Server, Smartphone, Globe, ArrowRight } from 'lucide-react';
import { t } from '@/lib/landing-i18n';

const layers = [
  {
    label: 'Frontend',
    tech: 'React 18 + TypeScript + Tailwind',
    color: 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800/50',
  },
  {
    label: 'Transport',
    tech: 'Tauri IPC · WebSocket · HTTP POST',
    color: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800/50',
  },
  {
    label: 'Backend',
    tech: 'Rust + Tokio + Axum + SQLite',
    color: 'bg-teal-50 dark:bg-teal-950/30 text-teal-800 dark:text-teal-200 border-teal-200 dark:border-teal-800/50',
  },
];

const platforms = [
  { icon: Monitor, label: 'Desktop', sub: 'Tauri 2' },
  { icon: Smartphone, label: 'Mobile', sub: 'iOS / Android' },
  { icon: Globe, label: 'Web', sub: 'Browser' },
  { icon: Server, label: 'CLI', sub: 'Headless' },
];

export function Architecture({ lang = 'en' }: { lang?: string }) {
  const i = t(lang).architecture;

  return (
    <section className="px-4 py-20 sm:py-28">
      <div className="mx-auto max-w-5xl">
        <div className="text-center">
          <h2 className="animate-fade-in-up text-3xl font-bold tracking-tight text-fd-foreground sm:text-4xl">
            {i.title}
          </h2>
          <p className="animate-fade-in-up stagger-1 mt-4 text-lg text-fd-muted-foreground">
            {i.subtitle}
          </p>
        </div>

        <div className="animate-fade-in-up stagger-2 mt-14 grid gap-6 sm:grid-cols-4">
          {platforms.map((p) => (
            <div
              key={p.label}
              className="flex flex-col items-center gap-2 rounded-xl border border-fd-border bg-fd-card p-6 text-center transition-colors hover:border-teal-300 dark:hover:border-teal-700"
            >
              <p.icon className="h-8 w-8 text-teal-500 dark:text-teal-400" />
              <span className="text-base font-semibold text-fd-foreground">{p.label}</span>
              <span className="text-sm text-fd-muted-foreground">{p.sub}</span>
            </div>
          ))}
        </div>

        <div className="animate-fade-in-up stagger-3 mt-6 flex justify-center">
          <div className="flex items-center gap-2 text-fd-muted-foreground">
            <ArrowRight className="h-4 w-4 rotate-90" />
          </div>
        </div>

        <div className="animate-fade-in-up stagger-4 mt-4 space-y-3">
          {layers.map((layer) => (
            <div
              key={layer.label}
              className={`flex items-center justify-between rounded-xl border px-6 py-4 ${layer.color}`}
            >
              <span className="text-base font-semibold">{layer.label}</span>
              <span className="text-sm opacity-80">{layer.tech}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
