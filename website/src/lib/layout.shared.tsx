import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

export const gitConfig = {
  user: 'Dwsy',
  repo: 'pi-session-manager',
  branch: 'main',
};

export function baseOptions(lang?: string): BaseLayoutProps {
  const prefix = lang ? `/${lang}` : '';

  return {
    nav: {
      title: 'Pi Session Manager',
    },
    links: [
      { text: lang === 'cn' ? '功能' : 'Features', url: `${prefix}/#features` },
      { text: lang === 'cn' ? '文档' : 'Docs', url: `${prefix}/docs` },
      { text: lang === 'cn' ? '下载' : 'Download', url: `${prefix}/#download` },
      {
        text: 'GitHub',
        url: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
        external: true,
      },
    ],
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  };
}
