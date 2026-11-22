import LegacyRedirect, { legacyRedirectMetadata } from '@/components/legacy-redirect'

// Old URL: school.newheightseducation.org/donations/nheg-library-campaign/ (retired GiveWP form)
export const metadata = legacyRedirectMetadata('Support NHEG')

export default function Page() {
  return (
    <LegacyRedirect
      to="https://www.zeffy.com/donation-form/48e1112a-8e9f-4c73-8b19-0caa89669ff5"
      label="Support NHEG"
    />
  )
}
