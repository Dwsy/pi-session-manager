import { DownloadSection } from '@/components/landing/download';
import { Footer } from '@/components/landing/footer';
import { Hero } from '@/components/landing/hero';
import { Positioning } from '@/components/landing/positioning';
import { ProductLayers } from '@/components/landing/product-layers';
import { RuntimeModes } from '@/components/landing/runtime-modes';
import { SessionSources } from '@/components/landing/session-sources';
import { i18n } from '@/lib/i18n';

export function generateStaticParams() {
  return i18n.languages.map((lang) => ({ lang }));
}

export default async function HomePage(props: PageProps<'/[lang]'>) {
  const { lang } = await props.params;

  return (
    <main className="landing-page overflow-x-hidden">
      <Hero lang={lang} />
      <Positioning lang={lang} />
      <ProductLayers lang={lang} />
      <SessionSources lang={lang} />
      <RuntimeModes lang={lang} />
      <DownloadSection lang={lang} />
      <Footer lang={lang} />
    </main>
  );
}
