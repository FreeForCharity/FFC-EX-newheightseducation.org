import type { Metadata } from 'next'
import { loadCloneContent } from '@/lib/clone-content'
import { pageMetadata } from '@/lib/page-metadata'

// Added after the capture by scripts/add-publication-issue.mjs. Re-run that
// script to change this issue rather than editing this file.
export const metadata: Metadata = {
  ...pageMetadata({
    title: 'NHEG EDGuide November - December 2026 - NHEG',
    description: 'NHEG EDGuide November - December 2026',
    canonical: '/publications/books/nheg-edguide-november-december-2026/',
  }),
  title: { absolute: 'NHEG EDGuide November - December 2026 - NHEG' },
}

export default function Page() {
  return (
    <div
      className="ffc-clone wp-singular dflip-template-default single single-dflip wp-custom-logo wp-embed-responsive wp-theme-astra ast-desktop ast-separate-container ast-two-container ast-right-sidebar astra-4.14.0 ast-sticky-sidebar group-blog ast-blog-single-style-1 ast-custom-post-type ast-single-post ast-replace-site-logo-transparent ast-inherit-site-logo-transparent ast-hfb-header ast-full-width-primary-header ast-normal-title-enabled elementor-default elementor-kit-5709"
      dangerouslySetInnerHTML={{
        __html: loadCloneContent('publications/books/nheg-edguide-november-december-2026'),
      }}
    />
  )
}
