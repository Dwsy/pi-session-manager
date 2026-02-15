import { RootProvider } from 'fumadocs-ui/provider/next';
import { i18nUI } from '@/lib/i18n-ui';

export default async function LangLayout({
  children,
  params,
}: LayoutProps<'/[lang]'>) {
  const { lang } = await params;

  return <RootProvider {...i18nUI.provider(lang)}>{children}</RootProvider>;
}
