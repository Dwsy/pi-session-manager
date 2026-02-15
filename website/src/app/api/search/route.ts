import { source } from '@/lib/source';
import { createFromSource } from 'fumadocs-core/search/server';

export const dynamic = 'force-static';

const search = createFromSource(source, {
  localeMap: {
    en: 'english',
    cn: {},
  },
});

export const { staticGET: GET } = search;
