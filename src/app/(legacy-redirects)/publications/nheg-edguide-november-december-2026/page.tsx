import LegacyRedirect, { legacyRedirectMetadata } from '@/components/legacy-redirect'

// Old URL: publications.newheightseducation.org/nheg-edguide-november-december-2026/
export const metadata = legacyRedirectMetadata('NHEG EDGuide November - December 2026')

export default function Page() {
  return (
    <LegacyRedirect
      to="/publications/books/nheg-edguide-november-december-2026/"
      label="NHEG EDGuide November - December 2026"
    />
  )
}
