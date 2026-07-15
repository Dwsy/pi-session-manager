import { ArrowRight } from 'lucide-react';
import { t } from '@/lib/landing-i18n';

const sessionSources = [
  'Pi',
  'Claude Code',
  'Codex',
  'OpenCode',
  'Gemini CLI',
  'Cursor',
  'Antigravity',
  'Factory',
  'ClawdBot',
] as const;

export function SessionSources({ lang = 'en' }: { lang?: string }) {
  const i = t(lang).sources;

  return (
    <section id="sources" className="scroll-mt-24 px-4 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:gap-16">
          <header>
            <p className="landing-kicker">{i.kicker}</p>
            <h2 className="landing-display mt-5 text-balance text-4xl font-semibold tracking-[-0.04em] text-fd-foreground sm:text-5xl">
              {i.title}
            </h2>
            <p className="mt-5 max-w-xl text-pretty text-lg leading-8 text-fd-muted-foreground">
              {i.description}
            </p>
          </header>

          <div className="landing-source-panel">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3">
              {sessionSources.map((source, index) => (
                <div key={source} className="landing-source-cell">
                  <span className="landing-mono text-[9px] tracking-[0.16em] text-fd-muted-foreground">
                    SRC-{String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="mt-2 flex items-center justify-between gap-3 text-sm font-semibold text-fd-foreground">
                    {source}
                    <span className="h-1.5 w-1.5 rounded-full bg-fd-primary" aria-hidden="true" />
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="landing-principle mt-10 grid gap-4 px-5 py-5 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-8 sm:px-7">
          <div className="flex items-center gap-3">
            <span className="landing-mono text-[10px] font-semibold tracking-[0.18em] text-fd-primary">
              {i.principleLabel}
            </span>
            <ArrowRight className="hidden h-4 w-4 text-fd-muted-foreground sm:block" aria-hidden="true" />
          </div>
          <p className="text-sm leading-6 text-fd-foreground sm:text-base sm:leading-7">{i.principle}</p>
        </div>
      </div>
    </section>
  );
}
