import type { Metadata } from 'next'
import SiteSearch from '@/components/site-search'
import { loadCloneContent } from '@/lib/clone-content'
import { pageMetadata } from '@/lib/page-metadata'

// The site's own chrome around Pagefind's search UI (#49). The fragment is
// built from the contact page by scripts/wire-site-search.mjs.
export const metadata: Metadata = {
  ...pageMetadata({
    title: 'Search - New Heights Educational Group, Inc.',
    description:
      'Search the articles, programs, publications and radio shows of New Heights Educational Group.',
    canonical: '/search/',
  }),
  title: { absolute: 'Search - New Heights Educational Group, Inc.' },
}

export default function Page() {
  return (
    <>
      <div
        className="ffc-clone wp-singular page-template-default page wp-theme-jupiter theme-jupiter woocommerce-no-js wpb-js-composer js-comp-ver-8.7.3 vc_responsive"
        data-pagefind-ignore="all"
        dangerouslySetInnerHTML={{ __html: loadCloneContent('search') }}
      />
      <SiteSearch />
    </>
  )
}
