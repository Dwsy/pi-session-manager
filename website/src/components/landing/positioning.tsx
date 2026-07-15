import { CircleCheck, CircleMinus } from 'lucide-react';
import { t } from '@/lib/landing-i18n';

export function Positioning({ lang = 'en' }: { lang?: string }) {
  const i = t(lang).positioning;

  return (
    <section id="philosophy" className="scroll-mt-24 px-4 py-18 sm:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:gap-16">
          <header className="max-w-xl">
            <p className="landing-kicker">{i.kicker}</p>
            <h2 className="landing-display mt-5 text-balance text-4xl font-semibold tracking-[-0.04em] text-fd-foreground sm:text-5xl">
              {i.title}
            </h2>
            <p className="mt-5 text-pretty text-lg leading-8 text-fd-muted-foreground">
              {i.description}
            </p>
          </header>

          <div className="landing-boundary-grid">
            <BoundaryColumn
              label={i.isLabel}
              items={i.is}
              icon="check"
            />
            <BoundaryColumn
              label={i.isNotLabel}
              items={i.isNot}
              icon="minus"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

interface BoundaryColumnProps {
  label: string;
  items: ReadonlyArray<{
    title: string;
    description: string;
  }>;
  icon: 'check' | 'minus';
}

function BoundaryColumn({ label, items, icon }: BoundaryColumnProps) {
  const Icon = icon === 'check' ? CircleCheck : CircleMinus;

  return (
    <div className="landing-boundary-column">
      <p className="landing-mono border-b border-fd-border/70 px-5 py-4 text-[10px] font-semibold tracking-[0.18em] text-fd-muted-foreground sm:px-6">
        {label}
      </p>
      <div className="divide-y divide-fd-border/70">
        {items.map((item) => (
          <div key={item.title} className="flex gap-4 px-5 py-5 sm:px-6">
            <Icon
              className={`mt-0.5 h-4 w-4 shrink-0 ${icon === 'check' ? 'text-fd-primary' : 'text-fd-muted-foreground'}`}
              aria-hidden="true"
            />
            <div>
              <h3 className="text-sm font-semibold text-fd-foreground sm:text-base">{item.title}</h3>
              <p className="mt-1 text-sm leading-6 text-fd-muted-foreground">{item.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
