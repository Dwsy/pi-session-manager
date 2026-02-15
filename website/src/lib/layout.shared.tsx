import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

export const gitConfig = {
  user: 'Dwsy',
  repo: 'pi-session-manager',
  branch: 'main',
};

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: 'Pi Session Manager',
    },
    links: [
      { text: 'Features', url: '/#features' },
      { text: 'Docs', url: '/docs' },
      { text: 'Download', url: '/#download' },
      {
        text: 'GitHub',
        url: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
        external: true,
      },
    ],
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  };
}
