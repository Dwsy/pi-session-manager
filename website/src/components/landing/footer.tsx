import { Github } from 'lucide-react';
import { t } from '@/lib/landing-i18n';

const demoHref = 'https://dwsy.github.io/pi-session-manager/demo/';
const releasesHref = 'https://github.com/Dwsy/pi-session-manager/releases/latest';
const githubHref = 'https://github.com/Dwsy/pi-session-manager';

export function Footer({ lang = 'en' }: { lang?: string }) {
  const i = t(lang).footer;
  const docsHref = `/${lang}/docs`;

  return (
    <footer className="border-t border-fd-border px-4 py-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <span className="landing-mono flex h-8 w-8 items-center justify-center rounded-sm border border-fd-border bg-fd-card text-[10px] font-semibold tracking-[0.08em] text-fd-foreground">
              PSM
            </span>
            <span className="font-semibold text-fd-foreground">Pi Session Manager</span>
          </div>
          <p className="mt-3 max-w-md text-sm leading-6 text-fd-muted-foreground">{i.tagline}</p>
          <p className="landing-mono mt-4 text-[10px] tracking-[0.12em] text-fd-muted-foreground">
            MIT LICENSE · DWSY
          </p>
        </div>

        <nav className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm" aria-label="Footer">
          <a href={docsHref} className="landing-footer-link">{i.docs}</a>
          <a href={demoHref} target="_blank" rel="noopener noreferrer" className="landing-footer-link">
            {i.demo}
          </a>
          <a href={releasesHref} target="_blank" rel="noopener noreferrer" className="landing-footer-link">
            {i.releases}
          </a>
          <a
            href={githubHref}
            target="_blank"
            rel="noopener noreferrer"
            className="landing-footer-link inline-flex items-center gap-2"
            aria-label={i.github}
          >
            <Github className="h-4 w-4" aria-hidden="true" />
            {i.github}
          </a>
        </nav>
      </div>
    </footer>
  );
}
