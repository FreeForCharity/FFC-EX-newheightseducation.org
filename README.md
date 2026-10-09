# New Heights Educational Group website

The website of **New Heights Educational Group, Inc.** (NHEG), a 501(c)(3) nonprofit in Sherwood, Ohio (EIN 26-1424214). NHEG promotes literacy for children and adults through educational support services for home, charter and public school families.

This repository is a static export of NHEG's former WordPress sites, served by GitHub Pages. [Free For Charity](https://freeforcharity.org) (FFC) hosts and maintains it at no cost.

## Status

_Last reviewed 2026-10-09. Live progress is on [#85: migration status](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/85)._

| Item                     | State                                                                                                                                                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Live site**            | **<https://freeforcharity.github.io/FFC-EX-newheightseducation.org/>** (the GitHub Pages default URL)                                                                                                       |
| Custom domain            | Not yet. `newheightseducation.org` still points at the old Bluehost WordPress install. Moving it is the cutover, gated on [#68](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/68) |
| Deploys                  | Automatic on every merge to `main`, after CI passes                                                                                                                                                         |
| Migration plan           | [#85](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/85), phases 0 to 5                                                                                                            |
| Onboarding and DNS (FFC) | [FFC-Cloudflare-Automation#1342](https://github.com/FreeForCharity/FFC-Cloudflare-Automation/issues/1342)                                                                                                   |
| Cutover readiness record | [docs/decisions/0001-cutover-readiness.md](./docs/decisions/0001-cutover-readiness.md)                                                                                                                      |

### Done

- **The whole old site is on `main`**: the main site and the `school`, `publications` and `radio` subdomains, mounted as sections of one site (table below).
- **The old site is archived.** Every page, 108 screenshots, the media libraries with checksums, the products, the form definitions and the PDF originals were saved on 2026-10-02, before the Bluehost hosting lapse ([#41](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/41), [docs/live-archive/2026-10-02](./docs/live-archive/2026-10-02/README.md)).
- **Pre-launch sign-off is done**: the fidelity audit against the live site ([#62](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/62)), styles and layouts across all routes ([#63](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/63)) and the cutover readiness record ([#66](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/66)).
- **Old links and bookmarks are handled in the repo**: links in the content point where the old site's redirects sent them, and each old path has a stub page that forwards to its new home ([docs/cutover/redirects.md](./docs/cutover/redirects.md), [#59](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/59)).

### Open

- **NHEG decisions** ([#42](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/42)). The forms ruling blocks [#53: forms](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/53). For now each of the old site's forms shows an interim "This form has moved to email" block for `info@newheightseducation.org`. That block is not the launch state: the proposal in [docs/decisions/0001-form-handling.md](./docs/decisions/0001-form-handling.md) is Google Forms owned by NHEG's own Google Workspace.
- **Subdomain redirects**: Cloudflare rules that send the old `school.`, `publications.` and `radio.` hosts to their new paths. The repo side is done; the rules need authorization ([#59](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/59)).
- **Custom domain staging** ([#65](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/65)): add `public/CNAME` and run FFC's preflight workflow 121. Held until authorized.
- **Cutover** ([#68](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/68)): point the domain at GitHub Pages. Separately gated, with a rollback plan in the readiness record.
- **DNS move.** A Cloudflare zone for the domain is ready on FFC's account, delegated to `ns1.freeforcharity.org` and `ns2.freeforcharity.org`, with the Google Workspace mail records and a corrected SPF and DMARC. As of the 2026-10-07 readiness record, the domain still delegates to Bluehost's nameservers. Changing the nameservers at the registrar is NHEG's step, tracked on [FFC-Cloudflare-Automation#1342](https://github.com/FreeForCharity/FFC-Cloudflare-Automation/issues/1342).

Questions the migration cannot settle by itself are collected in [docs/open-questions.md](./docs/open-questions.md).

## What is on the site

| Section                      | Path on this site | Came from                              | Captured pages |
| ---------------------------- | ----------------- | -------------------------------------- | -------------- |
| Main site                    | `/`               | `newheightseducation.org`              | 525            |
| School (NHEG Learning Annex) | `/school/`        | `school.newheightseducation.org`       | 111            |
| Publications                 | `/publications/`  | `publications.newheightseducation.org` | 270            |
| Radio show                   | `/radio/`         | `radio.newheightseducation.org`        | 23             |

The site also carries FFC's standard policy pages: privacy, cookies, terms of service, donation policies, vulnerability disclosure and security acknowledgements. Site search is built with [Pagefind](https://pagefind.app) at build time.

## How it is built

- **Static export.** Next.js 16 with `output: 'export'`, deployed to GitHub Pages by [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml).
- **Captured content.** Each captured page is an HTML fragment under [`src/clone-content/`](./src/clone-content/), produced by FFC's WordPress-to-Pages converter (workflow 706 in [FFC-Cloudflare-Automation](https://github.com/FreeForCharity/FFC-Cloudflare-Automation)). After `next build`, [`scripts/inline-clone-content.mjs`](./scripts/inline-clone-content.mjs) inlines each fragment into its page.
- **Links and assets.** Links inside the fragments use a `%%BASE%%` placeholder, so they work under today's `/FFC-EX-newheightseducation.org` subpath and on the custom domain later. Images, fonts and other assets the old site loaded are copied into [`public/_ffc-assets/`](./public/_ffc-assets/), grouped by original host. The capture reports are the `public/wp-capture-report*.json` files.
- **Base path.** With no `public/CNAME`, the deploy builds with the base path `/FFC-EX-newheightseducation.org`. Adding `public/CNAME` at the cutover switches the build to the domain root.
- **Edits.** Fixes to captured pages can be made here. If the same problem comes from the converter, fix it there as well, or the next capture will bring it back.

## Checks

| Workflow                                                             | When                       | What it checks                                                                          |
| -------------------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------- |
| [CI - Build and Test](./.github/workflows/ci.yml)                    | Every PR, and `main`       | Format, lint, unit tests, build, every asset served from the site, E2E tests, links     |
| [FFC Drift Check](./.github/workflows/drift-check.yml)               | Every PR, and `main`       | FFC conventions: kebab-case routes, `assetPath()`, CSP sync, no secrets or placeholders |
| [Phantom Revert Guard](./.github/workflows/phantom-revert-guard.yml) | Every PR                   | The branch is not too far behind `main`                                                 |
| [Deploy to GitHub Pages](./.github/workflows/deploy.yml)             | After CI passes on `main`  | Builds and publishes the site                                                           |
| [Post-Deploy Smoke Test](./.github/workflows/post-deploy-smoke.yml)  | After each deploy          | The live URL over HTTPS, every sitemap route, no leftover template content, screenshots |
| [Lighthouse CI](./.github/workflows/lighthouse.yml)                  | After each deploy, and PRs | Accessibility and SEO (blocking), performance and best practices (warnings)             |
| [Source Fidelity Check](./.github/workflows/fidelity-check.yml)      | Weekly                     | The export's text against the source site                                               |
| [Visual Fidelity Check](./.github/workflows/visual-check.yml)        | Weekly                     | Screenshots of the export against the source site                                       |
| [Security Audit](./.github/workflows/security-audit.yml)             | Daily, and PRs             | Dependency vulnerabilities                                                              |

## Local development

The repository is large: the localized assets alone are about 700 MB.

```bash
pnpm install
pnpm run dev          # http://localhost:3000
pnpm run build        # static export to ./out
pnpm run preview      # serve ./out at http://localhost:3000
```

Run these before committing, in order. The pre-commit hook checks formatting, lint and drift.

```bash
pnpm run format
pnpm run lint
pnpm run check:drift
pnpm test
pnpm run build
pnpm run check:assets
pnpm run check-links
pnpm run test:e2e
```

## Contributing

- Work on a branch and open a pull request. Never push to `main`.
- Use [Conventional Commits](https://www.conventionalcommits.org/) and link issues with `Fixes #NNN` or `Refs #NNN`.
- Use kebab-case route folders and `assetPath()` for asset references.
- See [CONTRIBUTING.md](./CONTRIBUTING.md), [SECURITY.md](./SECURITY.md) and [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

## Template documentation

This repository started from the [FFC Single Page Template](https://github.com/FreeForCharity/FFC-IN-FFC_Single_Page_Template). Several top-level files still describe that template rather than this site, and still cite its URL, among them `QUICK_START.md`, `TEMPLATE_USAGE.md`, `TEMPLATE_SETUP_CHECKLIST.md`, `DEPLOYMENT.md`, `TESTING.md` and `SITE_IMPROVEMENTS.md`. Read them as background on the shared tooling. This README is the source for this site's own status.

## About

**New Heights Educational Group, Inc.** · 11809 US Route 127, Sherwood, Ohio 43556 · 419.786.0247 · `info@newheightseducation.org`

Hosted by **Free For Charity**, a 501(c)(3) nonprofit (EIN 46-2471893) that provides free websites and domain management to charities. See [LICENSE](./LICENSE).
