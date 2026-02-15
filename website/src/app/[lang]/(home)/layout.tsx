import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { baseOptions } from '@/lib/layout.shared';

export default function Layout({ children, params }: LayoutProps<'/[lang]'>) {
  return <HomeLayout {...baseOptions()}>{children}</HomeLayout>;
}
