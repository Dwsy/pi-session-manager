import { Hero } from '@/components/landing/hero';
import { Features } from '@/components/landing/features';
import { Architecture } from '@/components/landing/architecture';
import { DownloadSection } from '@/components/landing/download';
import { QuickStart } from '@/components/landing/quickstart';
import { Footer } from '@/components/landing/footer';

export default async function HomePage(props: PageProps<'/[lang]'>) {
  const { lang } = await props.params;

  return (
    <main className="overflow-x-hidden">
      <Hero lang={lang} />
      <Features lang={lang} />
      <Architecture lang={lang} />
      <QuickStart lang={lang} />
      <DownloadSection lang={lang} />
      <Footer lang={lang} />
    </main>
  );
}
