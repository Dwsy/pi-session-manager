'use client';

import { useEffect, useState } from 'react';
import { Apple, Monitor, Download } from 'lucide-react';
import { t } from '@/lib/landing-i18n';

type OS = 'mac' | 'windows' | 'linux' | 'unknown';

function detectOS(): OS {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('mac')) return 'mac';
  if (ua.includes('win')) return 'windows';
  if (ua.includes('linux')) return 'linux';
  return 'unknown';
}

const REPO = 'https://github.com/Dwsy/pi-session-manager/releases/latest';

const downloads: { os: OS; label: string; icon: typeof Apple; suffix: string }[] = [
  { os: 'mac', label: 'macOS', icon: Apple, suffix: '.dmg' },
  { os: 'windows', label: 'Windows', icon: Monitor, suffix: '.msi' },
  { os: 'linux', label: 'Linux', icon: Monitor, suffix: '.AppImage' },
];

export function DownloadSection({ lang = 'en' }: { lang?: string }) {
  const [currentOS, setCurrentOS] = useState<OS>('unknown');
  const i = t(lang).download;

  useEffect(() => {
    setCurrentOS(detectOS());
  }, []);

  const sorted = [...downloads].sort((a, b) => {
    if (a.os === currentOS) return -1;
    if (b.os === currentOS) return 1;
    return 0;
  });

  return (
    <section id="download" className="px-4 py-20 sm:py-28">
      <div className="mx-auto max-w-4xl text-center">
        <h2 className="animate-fade-in-up text-3xl font-bold tracking-tight text-fd-foreground sm:text-4xl">
          {i.title}
        </h2>
        <p className="animate-fade-in-up stagger-1 mt-4 text-lg text-fd-muted-foreground">
          {i.subtitle}
        </p>

        <div className="animate-fade-in-up stagger-2 mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          {sorted.map((d) => {
            const isPrimary = d.os === currentOS;
            return (
              <a
                key={d.os}
                href={REPO}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-3 rounded-lg px-6 py-3.5 text-base font-semibold transition-colors ${
                  isPrimary
                    ? 'bg-teal-500 hover:bg-teal-600 dark:bg-teal-500 dark:hover:bg-teal-400 text-white dark:text-teal-950 shadow-lg shadow-teal-500/20'
                    : 'border border-fd-border bg-fd-card hover:bg-fd-accent text-fd-foreground'
                }`}
              >
                <d.icon className="h-5 w-5" />
                {d.label}
                {isPrimary && (
                  <span className="rounded-full bg-white/20 dark:bg-black/10 px-2 py-0.5 text-xs">
                    {i.recommended}
                  </span>
                )}
              </a>
            );
          })}
        </div>

        <a
          href={REPO}
          target="_blank"
          rel="noopener noreferrer"
          className="animate-fade-in-up stagger-3 mt-6 inline-flex items-center gap-2 text-sm text-fd-muted-foreground hover:text-teal-500 transition-colors"
        >
          <Download className="h-4 w-4" />
          {i.viewAll}
        </a>
      </div>
    </section>
  );
}
