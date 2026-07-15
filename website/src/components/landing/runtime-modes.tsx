import { ArrowRight, Braces, Database, Globe2, Laptop } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { t } from '@/lib/landing-i18n';

const modeIcons: LucideIcon[] = [Laptop, Globe2, Braces, Database];

export function RuntimeModes({ lang = 'en' }: { lang?: string }) {
  const i = t(lang).runtime;

  return (
    <section className="landing-runtime px-4 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl">
        <div className="grid min-w-0 gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:gap-16">
          <header className="min-w-0">
            <p className="landing-kicker">{i.kicker}</p>
            <h2 className="landing-display mt-5 text-balance text-4xl font-semibold tracking-[-0.04em] text-fd-foreground sm:text-5xl">
              {i.title}
            </h2>
            <p className="mt-5 max-w-xl text-pretty text-lg leading-8 text-fd-muted-foreground">
              {i.description}
            </p>
          </header>

          <div className="min-w-0">
            <div className="landing-flow-track">
              {i.flow.map((step, index) => (
                <div key={step} className="contents">
                  <div className="landing-flow-step">
                    <span className="landing-mono text-[9px] text-fd-muted-foreground">0{index + 1}</span>
                    <span className="landing-mono text-[10px] font-semibold tracking-[0.12em] text-fd-foreground sm:text-xs">
                      {step}
                    </span>
                  </div>
                  {index < i.flow.length - 1 && (
                    <ArrowRight className="h-4 w-4 shrink-0 text-fd-muted-foreground" aria-hidden="true" />
                  )}
                </div>
              ))}
            </div>

            <div className="mt-6 grid border-l border-t border-fd-border sm:grid-cols-2">
              {i.modes.map((mode, index) => {
                const Icon = modeIcons[index] ?? Database;
                return (
                  <article key={mode.title} className="landing-runtime-cell">
                    <div className="flex items-start justify-between gap-4">
                      <Icon className="h-5 w-5 text-fd-primary" strokeWidth={1.75} aria-hidden="true" />
                      <span className="landing-mono text-[9px] tracking-[0.14em] text-fd-muted-foreground">
                        {mode.label}
                      </span>
                    </div>
                    <h3 className="mt-7 text-lg font-semibold text-fd-foreground">{mode.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-fd-muted-foreground">{mode.description}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
