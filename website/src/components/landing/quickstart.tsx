import { t } from '@/lib/landing-i18n';

const stepCodes = [
  '# Or install CLI for headless servers\ncurl -fsSL https://github.com/Dwsy/pi-session-manager/releases/latest',
  '# Default: ~/.pi/agent/sessions\n# Add custom paths in Settings → Session Paths',
  '# CLI mode for remote servers\n./pi-session-cli --bind 0.0.0.0:52131',
];

const stepNumbers = ['01', '02', '03'];

export function QuickStart({ lang = 'en' }: { lang?: string }) {
  const i = t(lang).quickstart;

  return (
    <section className="px-4 py-20 sm:py-28 bg-fd-card/50">
      <div className="mx-auto max-w-4xl">
        <div className="text-center">
          <h2 className="animate-fade-in-up text-3xl font-bold tracking-tight text-fd-foreground sm:text-4xl">
            {i.title}
          </h2>
          <p className="animate-fade-in-up stagger-1 mt-4 text-lg text-fd-muted-foreground">
            {i.subtitle}
          </p>
        </div>

        <div className="mt-14 space-y-8">
          {i.steps.map((step, idx) => (
            <div
              key={idx}
              className={`animate-fade-in-up stagger-${idx + 2} flex flex-col gap-4 sm:flex-row sm:gap-8`}
            >
              <div className="flex-shrink-0">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-teal-500 text-sm font-bold text-white dark:text-teal-950">
                  {stepNumbers[idx]}
                </span>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-fd-foreground">{step.title}</h3>
                <p className="mt-1 text-fd-muted-foreground">{step.description}</p>
                <pre className="mt-3 overflow-x-auto rounded-lg border border-fd-border bg-fd-background p-4 text-sm text-fd-muted-foreground">
                  <code>{stepCodes[idx]}</code>
                </pre>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
