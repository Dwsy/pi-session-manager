import {
  Search,
  LayoutGrid,
  GitBranch,
  Terminal,
  BarChart3,
  Tags,
  FileOutput,
  Globe,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { t } from '@/lib/landing-i18n';

const featureIcons: LucideIcon[] = [
  LayoutGrid,
  Search,
  GitBranch,
  Terminal,
  BarChart3,
  Tags,
  FileOutput,
  Globe,
];

export function Features({ lang = 'en' }: { lang?: string }) {
  const i = t(lang).features;

  return (
    <section id="features" className="px-4 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <h2 className="animate-fade-in-up text-3xl font-bold tracking-tight text-fd-foreground sm:text-4xl">
            {i.title}
          </h2>
          <p className="animate-fade-in-up stagger-1 mt-4 text-lg text-fd-muted-foreground">
            {i.subtitle}
          </p>
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {i.items.map((feature, idx) => {
            const Icon = featureIcons[idx];
            return (
              <div
                key={idx}
                className={`animate-fade-in-up stagger-${idx + 1} group relative rounded-xl border border-fd-border bg-fd-card p-6 transition-all hover:border-teal-300 dark:hover:border-teal-700 hover:shadow-lg hover:shadow-teal-500/5`}
              >
                <div className="mb-4 inline-flex rounded-lg bg-teal-100 dark:bg-teal-900/30 p-2.5 text-teal-600 dark:text-teal-400 transition-colors group-hover:bg-teal-200 dark:group-hover:bg-teal-800/40">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold text-fd-foreground">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-fd-muted-foreground">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
