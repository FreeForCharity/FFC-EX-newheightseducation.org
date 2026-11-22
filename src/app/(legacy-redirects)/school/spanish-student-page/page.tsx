import LegacyRedirect, { legacyRedirectMetadata } from '@/components/legacy-redirect'

// Old URL: school.newheightseducation.org/spanish-student-page/ (password-protected, not migrated)
export const metadata = legacyRedirectMetadata('Students')

export default function Page() {
  return <LegacyRedirect to="/school/students/" label="Students" />
}
