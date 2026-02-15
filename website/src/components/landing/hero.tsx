import Link from 'next/link';
import { ArrowRight, Github } from 'lucide-react';
import { t } from '@/lib/landing-i18n';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export function Hero({ lang = 'en' }: { lang?: string }) {
  const i = t(lang).hero;
  const docsHref = `/${lang}/docs`;

  return (
    <section className="relative overflow-hidden px-4 pt-20 pb-16 sm:pt-28 sm:pb-24">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 h-[600px] w-[900px] rounded-full bg-teal-400/10 dark:bg-teal-500/5 blur-3xl" />
        <div className="absolute top-40 right-0 h-[300px] w-[400px] rounded-full bg-cyan-300/10 dark:bg-cyan-500/5 blur-3xl" />
      </div>

      <div className="mx-auto max-w-4xl text-center">
        <div className="animate-fade-in-up mb-6 inline-flex items-center gap-2 rounded-full border border-teal-200 dark:border-teal-800/50 bg-teal-50 dark:bg-teal-950/30 px-4 py-1.5 text-sm text-teal-700 dark:text-teal-300">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-500" />
          </span>
          {i.badge}
        </div>

        <h1 className="animate-fade-in-up stagger-1 text-4xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
          <span className="text-fd-foreground">{i.titleLine1}</span>
          <br />
          <span className="bg-gradient-to-r from-teal-500 via-cyan-500 to-teal-600 dark:from-teal-300 dark:via-cyan-400 dark:to-teal-400 bg-clip-text text-transparent animate-shimmer">
            {i.titleLine2}
          </span>
        </h1>

        <p className="animate-fade-in-up stagger-2 mx-auto mt-6 max-w-2xl text-lg text-fd-muted-foreground sm:text-xl">
          {i.description}
        </p>

        <div className="animate-fade-in-up stagger-3 mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href={docsHref}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-500 hover:bg-teal-600 dark:bg-teal-500 dark:hover:bg-teal-400 px-6 py-3 text-base font-semibold text-white dark:text-teal-950 transition-colors"
          >
            {i.getStarted}
            <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href="https://github.com/Dwsy/pi-session-manager"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-fd-border bg-fd-background hover:bg-fd-accent px-6 py-3 text-base font-semibold text-fd-foreground transition-colors"
          >
            <Github className="h-4 w-4" />
            {i.github}
          </a>
        </div>

        <div className="animate-fade-in-up stagger-4 mt-14 sm:mt-20">
          <div className="relative mx-auto max-w-5xl overflow-hidden rounded-xl border border-fd-border shadow-2xl shadow-teal-500/5 dark:shadow-teal-500/10">
            <div className="flex items-center gap-2 border-b border-fd-border bg-fd-card px-4 py-3">
              <div className="h-3 w-3 rounded-full bg-red-400/80" />
              <div className="h-3 w-3 rounded-full bg-teal-400/80" />
              <div className="h-3 w-3 rounded-full bg-green-400/80" />
              <span className="ml-2 text-xs text-fd-muted-foreground">Pi Session Manager</span>
            </div>
            <picture>
              <source
                srcSet="https://github.com/user-attachments/assets/4cb92d95-f50e-48d2-8c5e-4bb814d45b8f"
                media="(prefers-color-scheme: dark)"
              />
              <img
                src={`${basePath}/screenshot-light.png`}
                alt="Pi Session Manager screenshot"
                className="w-full"
                loading="eager"
              />
            </picture>
          </div>
        </div>
      </div>
    </section>
  );
}
