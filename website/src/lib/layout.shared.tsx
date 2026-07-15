import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { i18n } from './i18n';
import { t } from './landing-i18n';

export const gitConfig = {
  user: 'Dwsy',
  repo: 'pi-session-manager',
  branch: 'main',
};

export function baseOptions(lang?: string): BaseLayoutProps {
  const prefix = lang ? `/${lang}` : '';
  const nav = t(lang ?? 'en').nav;

  return {
    i18n,
    nav: {
      title: 'Pi Session Manager',
    },
    links: [
      { text: nav.philosophy, url: `${prefix}/#philosophy` },
      { text: nav.capabilities, url: `${prefix}/#capabilities` },
      { text: nav.sources, url: `${prefix}/#sources` },
      { text: nav.docs, url: `${prefix}/docs` },
      { text: nav.download, url: `${prefix}/#download` },
      {
        text: nav.demo,
        url: 'https://dwsy.github.io/pi-session-manager/demo/',
        external: true,
      },
    ],
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  };
}
