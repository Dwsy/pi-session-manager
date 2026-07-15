import { Check } from 'lucide-react';
import { t } from '@/lib/landing-i18n';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const screenshots = [
  { light: '/screenshots/kanban-light.png', dark: '/screenshots/kanban-dark.png' },
  { light: '/screenshots/session-tree-light.png', dark: '/screenshots/session-tree-dark.png' },
  { light: '/screenshots/home-light.png', dark: '/screenshots/home-dark.png' },
] as const;

export function ProductLayers({ lang = 'en' }: { lang?: string }) {
  const i = t(lang).layers;

  return (
    <section id="capabilities" className="scroll-mt-24 px-4 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl">
        <header className="max-w-3xl">
          <p className="landing-kicker">{i.kicker}</p>
          <h2 className="landing-display mt-5 text-balance text-4xl font-semibold tracking-[-0.04em] text-fd-foreground sm:text-5xl lg:text-6xl">
            {i.title}
          </h2>
          <p className="mt-5 max-w-2xl text-pretty text-lg leading-8 text-fd-muted-foreground">
            {i.description}
          </p>
        </header>

        <div className="mt-16 space-y-20 sm:mt-20 sm:space-y-28">
          {i.items.map((item, index) => {
            const reverse = index % 2 === 1;
            return (
              <article
                key={item.index}
                className={`grid items-center gap-10 lg:gap-16 ${
                  reverse
                    ? 'lg:grid-cols-[minmax(0,1.22fr)_minmax(0,0.78fr)]'
                    : 'lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)]'
                }`}
              >
                <div className={reverse ? 'lg:order-2' : undefined}>
                  <div className="flex items-center gap-4">
                    <span className="landing-mono text-xs font-semibold tracking-[0.16em] text-fd-primary">
                      {item.index}
                    </span>
                    <span className="h-px w-10 bg-fd-border" aria-hidden="true" />
                    <span className="landing-mono text-[10px] font-semibold tracking-[0.18em] text-fd-muted-foreground">
                      {item.label}
                    </span>
                  </div>

                  <h3 className="landing-display mt-5 text-balance text-3xl font-semibold tracking-[-0.035em] text-fd-foreground sm:text-4xl">
                    {item.title}
                  </h3>
                  <p className="mt-5 text-pretty text-base leading-7 text-fd-muted-foreground sm:text-lg sm:leading-8">
                    {item.description}
                  </p>

                  <ul className="mt-7 space-y-3">
                    {item.points.map((point) => (
                      <li key={point} className="flex items-start gap-3 text-sm leading-6 text-fd-foreground sm:text-base">
                        <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border border-fd-primary/40 bg-fd-primary/10 text-fd-primary">
                          <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
                        </span>
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>

                <figure className={`landing-story-frame ${reverse ? 'lg:order-1' : ''}`}>
                  <figcaption className="landing-story-bar">
                    <span className="landing-mono text-[10px] font-semibold tracking-[0.14em] text-fd-muted-foreground">
                      {item.label}
                    </span>
                    <span className="landing-mono text-[10px] text-fd-muted-foreground">{item.index} / 03</span>
                  </figcaption>
                  <img
                    src={`${basePath}${screenshots[index].light}`}
                    alt={item.imageAlt}
                    width={1400}
                    height={900}
                    loading="lazy"
                    className="landing-screenshot landing-screenshot-light aspect-[14/9] w-full object-cover object-top"
                  />
                  <img
                    src={`${basePath}${screenshots[index].dark}`}
                    alt={item.imageAlt}
                    width={1400}
                    height={900}
                    loading="lazy"
                    className="landing-screenshot landing-screenshot-dark aspect-[14/9] w-full object-cover object-top"
                  />
                  <div className="landing-screenshot-caption">
                    <p>{item.imageCaption}</p>
                    <ul aria-label={item.label}>
                      {item.imageFeatures.map((feature) => (
                        <li key={feature}>{feature}</li>
                      ))}
                    </ul>
                  </div>
                </figure>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
