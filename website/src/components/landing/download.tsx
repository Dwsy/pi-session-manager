'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, BookOpen, Download, Play } from 'lucide-react';
import { t } from '@/lib/landing-i18n';

type OS = 'macOS' | 'Windows' | 'Linux' | null;

const releasesHref = 'https://github.com/Dwsy/pi-session-manager/releases/latest';
const demoHref = 'https://dwsy.github.io/pi-session-manager/demo/';

function detectOS(): OS {
  if (typeof navigator === 'undefined') return null;
  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes('mac')) return 'macOS';
  if (userAgent.includes('win')) return 'Windows';
  if (userAgent.includes('linux')) return 'Linux';
  return null;
}

export function DownloadSection({ lang = 'en' }: { lang?: string }) {
  const [currentOS, setCurrentOS] = useState<OS>(null);
  const i = t(lang).download;
  const docsHref = `/${lang}/docs/installation`;

  useEffect(() => {
    setCurrentOS(detectOS());
  }, []);

  return (
    <section id="download" className="scroll-mt-24 px-4 py-20 sm:py-28">
      <div className="landing-download mx-auto max-w-7xl overflow-hidden">
        <div className="landing-download-grid" aria-hidden="true" />
        <div className="relative z-10 grid gap-10 px-6 py-10 sm:px-10 sm:py-14 lg:grid-cols-[1fr_auto] lg:items-end lg:px-14 lg:py-16">
          <div className="max-w-3xl">
            <p className="landing-kicker">{i.kicker}</p>
            <h2 className="landing-display mt-5 text-balance text-4xl font-semibold tracking-[-0.045em] text-fd-foreground sm:text-5xl lg:text-6xl">
              {i.title}
            </h2>
            <p className="mt-5 max-w-2xl text-pretty text-lg leading-8 text-fd-muted-foreground">
              {i.description}
            </p>
          </div>

          <div className="flex min-w-64 flex-col gap-3">
            <a
              href={releasesHref}
              target="_blank"
              rel="noopener noreferrer"
              className="landing-action landing-action-primary w-full justify-between"
            >
              <span className="flex items-center gap-2">
                <Download className="h-4 w-4" aria-hidden="true" />
                {currentOS ? `${i.downloadFor} ${currentOS}` : i.viewReleases}
              </span>
              {currentOS ? (
                <span className="landing-mono rounded-sm border border-current/25 px-1.5 py-0.5 text-[9px] tracking-[0.12em]">
                  {i.recommended}
                </span>
              ) : (
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              )}
            </a>
            <a
              href={demoHref}
              target="_blank"
              rel="noopener noreferrer"
              className="landing-action landing-action-secondary w-full justify-between"
            >
              <span className="flex items-center gap-2">
                <Play className="h-4 w-4" aria-hidden="true" />
                {i.demoAction}
              </span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
            <a href={docsHref} className="landing-text-link mt-1 justify-center">
              <BookOpen className="h-4 w-4" aria-hidden="true" />
              {i.docsAction}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
