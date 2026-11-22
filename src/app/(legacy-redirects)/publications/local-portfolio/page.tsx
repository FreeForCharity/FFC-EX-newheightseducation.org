import LegacyRedirect, { legacyRedirectMetadata } from '@/components/legacy-redirect'

// Old URL: publications.newheightseducation.org/local-portfolio/ (already broken on the old site)
export const metadata = legacyRedirectMetadata('NHEG Publications')

export default function Page() {
  return <LegacyRedirect to="/publications/" label="NHEG Publications" />
}
