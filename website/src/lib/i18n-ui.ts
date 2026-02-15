import { defineI18nUI } from 'fumadocs-ui/i18n';
import { i18n } from './i18n';

export const i18nUI = defineI18nUI(i18n, {
  translations: {
    en: { displayName: 'English' },
    cn: {
      displayName: '简体中文',
      search: '搜索文档...',
      searchNoResult: '没有找到结果',
      toc: '目录',
      tocNoHeadings: '没有标题',
      lastUpdate: '最后更新',
      chooseLanguage: '选择语言',
      nextPage: '下一页',
      previousPage: '上一页',
      chooseTheme: '选择主题',
      editOnGithub: '在 GitHub 上编辑',
    },
  },
});
