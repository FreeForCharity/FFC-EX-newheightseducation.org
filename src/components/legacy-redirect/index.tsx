import type { Metadata } from 'next'
import { assetPath } from '@/lib/assetPath'

// Old Bluehost subdomain URLs that have no page on this site. Cloudflare sends
// school./publications.<domain>/<path> to /<section>/<path>; these stubs catch
// the few paths with no match and forward them. GitHub Pages cannot send a
// server-side redirect, so the stub uses a meta refresh plus a visible link.

/** Resolves a same-site path through assetPath; leaves absolute URLs alone. */
export function legacyTarget(to: string): string {
  return /^https?:\/\//.test(to) ? to : assetPath(to)
}

export function legacyRedirectMetadata(title: string): Metadata {
  return { title, robots: { index: false } }
}

export default function LegacyRedirect({ to, label }: { to: string; label: string }) {
  const href = legacyTarget(to)
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center">
      <meta httpEquiv="refresh" content={`0;url=${href}`} />
      <h1 className="text-2xl font-semibold">This page has moved</h1>
      <p className="mt-4">
        Continue to <a href={href}>{label}</a>.
      </p>
    </div>
  )
}
