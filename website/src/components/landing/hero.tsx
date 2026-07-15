import Link from 'next/link';
import { ArrowRight, BookOpen, Download } from 'lucide-react';
import { t } from '@/lib/landing-i18n';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const demoHref = 'https://dwsy.github.io/pi-session-manager/demo/';

export function Hero({ lang = 'en' }: { lang?: string }) {
  const i = t(lang).hero;
  const docsHref = `/${lang}/docs`;

  return (
    <section className="landing-hero relative overflow-hidden px-4 pb-18 pt-14 sm:pb-24 sm:pt-20 lg:pb-28 lg:pt-24">
      <div className="landing-grid" aria-hidden="true" />

      <div className="relative mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)] lg:gap-16">
        <div className="relative z-10">
          <p className="landing-kicker landing-enter">{i.eyebrow}</p>

          <h1 className="landing-display landing-enter landing-delay-1 mt-6 text-balance text-5xl font-semibold leading-[0.98] tracking-[-0.055em] text-fd-foreground sm:text-6xl lg:text-[5.2rem]">
            <span className="block">{i.titleLeading}</span>
            <span className="landing-title-accent block">{i.titleAccent}</span>
          </h1>

          <p className="landing-enter landing-delay-2 mt-7 max-w-2xl text-pretty text-lg leading-8 text-fd-muted-foreground sm:text-xl">
            {i.description}
          </p>

          <div className="landing-enter landing-delay-3 mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <a
              href={demoHref}
              target="_blank"
              rel="noopener noreferrer"
              className="landing-action landing-action-primary"
            >
              {i.primaryAction}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
            <a href="#download" className="landing-action landing-action-secondary">
              <Download className="h-4 w-4" aria-hidden="true" />
              {i.secondaryAction}
            </a>
            <Link href={docsHref} className="landing-text-link">
              <BookOpen className="h-4 w-4" aria-hidden="true" />
              {i.docsAction}
            </Link>
          </div>

          <dl className="landing-enter landing-delay-4 mt-10 grid max-w-xl grid-cols-3 border-y border-fd-border/70">
            {i.metrics.map((metric) => (
              <div key={metric.label} className="py-4 pr-3 not-last:border-r not-last:border-fd-border/70 not-first:pl-4">
                <dt className="landing-mono text-sm font-semibold tracking-[0.06em] text-fd-foreground sm:text-base">
                  {metric.value}
                </dt>
                <dd className="mt-1 text-xs leading-5 text-fd-muted-foreground">{metric.label}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="landing-enter landing-delay-3 relative mx-auto w-full max-w-3xl lg:mx-0">
          <div className="landing-orbit landing-orbit-one" aria-hidden="true" />
          <div className="landing-orbit landing-orbit-two" aria-hidden="true" />

          <figure className="landing-product-window relative overflow-hidden">
            <figcaption className="landing-window-bar">
              <div className="flex items-center gap-2" aria-hidden="true">
                <span className="landing-window-dot" />
                <span className="landing-window-dot" />
                <span className="landing-window-dot" />
              </div>
              <span className="landing-mono truncate text-[10px] font-medium tracking-[0.14em] text-fd-muted-foreground sm:text-xs">
                {i.windowLabel}
              </span>
              <span className="landing-mono flex items-center gap-2 text-[9px] tracking-[0.12em] text-fd-muted-foreground sm:text-[10px]">
                <span className="h-1.5 w-1.5 rounded-full bg-fd-primary" aria-hidden="true" />
                {i.windowStatus}
              </span>
            </figcaption>
            <img
              src={`${basePath}/screenshots/session-page-light.png`}
              alt={i.screenshotAlt}
              width={1400}
              height={900}
              loading="eager"
              fetchPriority="high"
              className="landing-screenshot landing-screenshot-light aspect-[14/9] w-full object-cover object-top"
            />
            <img
              src={`${basePath}/screenshots/session-page-dark.png`}
              alt={i.screenshotAlt}
              width={1400}
              height={900}
              loading="eager"
              fetchPriority="high"
              className="landing-screenshot landing-screenshot-dark aspect-[14/9] w-full object-cover object-top"
            />
            <div className="landing-screenshot-caption">
              <p>{i.screenshotCaption}</p>
              <ul aria-label={i.windowLabel}>
                {i.screenshotFeatures.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
            </div>
          </figure>

          <div className="landing-trace-card landing-trace-card-top hidden sm:block" aria-hidden="true">
            <span className="landing-mono text-[9px] tracking-[0.16em] text-fd-muted-foreground">ACTIVE BRANCH</span>
            <span className="mt-2 block text-sm font-medium text-fd-foreground">session → compaction → decision</span>
          </div>
          <div className="landing-trace-card landing-trace-card-bottom hidden sm:block" aria-hidden="true">
            <span className="landing-mono text-[9px] tracking-[0.16em] text-fd-muted-foreground">TOOL TRACE</span>
            <span className="mt-2 flex items-center gap-2 text-sm font-medium text-fd-foreground">
              <span className="h-2 w-2 rounded-full bg-fd-primary" />
              37 operations indexed
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
