import { Github, Heart } from 'lucide-react';
import { t } from '@/lib/landing-i18n';

export function Footer({ lang = 'en' }: { lang?: string }) {
  const i = t(lang).footer;

  return (
    <footer className="border-t border-fd-border px-4 py-12">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 sm:flex-row sm:justify-between">
        <div className="flex items-center gap-2 text-sm text-fd-muted-foreground">
          <span>Pi Session Manager</span>
          <span className="text-fd-border">·</span>
          <span>MIT License</span>
        </div>

        <div className="flex items-center gap-6">
          <a
            href="https://github.com/Dwsy/pi-session-manager"
            target="_blank"
            rel="noopener noreferrer"
            className="text-fd-muted-foreground hover:text-fd-foreground transition-colors"
            aria-label="GitHub"
          >
            <Github className="h-5 w-5" />
          </a>
          <span className="inline-flex items-center gap-1.5 text-sm text-fd-muted-foreground">
            {i.madeWith} <Heart className="h-3.5 w-3.5 text-teal-500 fill-teal-500" /> {i.by}
          </span>
        </div>
      </div>
    </footer>
  );
}
