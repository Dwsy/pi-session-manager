import { IBM_Plex_Mono, Space_Grotesk } from 'next/font/google';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { baseOptions } from '@/lib/layout.shared';

const landingDisplay = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-landing-display',
  display: 'swap',
});

const landingMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-landing-mono',
  display: 'swap',
});

export default async function Layout({ children, params }: LayoutProps<'/[lang]'>) {
  const { lang } = await params;

  return (
    <HomeLayout {...baseOptions(lang)}>
      <div className={`${landingDisplay.variable} ${landingMono.variable} contents`}>
        {children}
      </div>
    </HomeLayout>
  );
}
