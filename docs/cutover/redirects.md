# Legacy URL redirects

How old newheightseducation.org URLs keep working after cutover, for [#59: legacy URL continuity](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/59). Every target below was checked against the live site on 2026-10-06. For where every live page landed, in plain language for the site owners, see [`url-map.md`](./url-map.md).

## In this repo (done)

- **Links in the content:** `scripts/relink-legacy-urls.mjs` ([#116](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/pull/116)) points old links where the live site's redirects sent them.
- **Old URLs typed or bookmarked:** `scripts/write-legacy-stubs.mjs` writes a `noindex` meta-refresh page at each old path below. Targets are relative, so the stubs work at the github.io subpath and at the apex.

| Old path                                                                                    | Goes to                                                                | Live behaviour                                                                                                                           |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `/page/2/` to `/page/64/`                                                                   | `/`                                                                    | Rendered the front page for any page number                                                                                              |
| `/cart/`, `/my-account/`                                                                    | `/shop/`                                                               | WooCommerce pages; the store is a static catalog now ([#54](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/54)) |
| `/parents/events/<event>/`                                                                  | `/events/<event>/`                                                     | 301                                                                                                                                      |
| `/nheg-parents/nheg-home-charter-school-events/<event>/`                                    | `/events/<event>/`                                                     | 301                                                                                                                                      |
| `/who-we-are/books/<book>/`                                                                 | `/who-we-are/nheg-books/<book>/`                                       | 301                                                                                                                                      |
| `/nheg-programs/<program>/`                                                                 | `/nheg-educational-programs/<program>/`                                | 301                                                                                                                                      |
| `/nheg-news/nheg-recognition-day-2017/`                                                     | `/nheg-news/nheg-recognition-day-2017-event/`                          | 301                                                                                                                                      |
| `/nheg-radio-show/`                                                                         | `/category/nheg-radio-show/`                                           | 200, with that canonical                                                                                                                 |
| `/animation-course/`                                                                        | `/school/online-courses/animation-course/`                             | 301 to the school host                                                                                                                   |
| `/who-we-are/nheg-groups/veterans-and-emergency-responders-support/`                        | `/school/about/nheg-groups/veterans-and-emergency-responders-support/` | 301 to the school host                                                                                                                   |
| `/feed/`                                                                                    | `/nheg-blog/`                                                          | the RSS feed; a static site can't serve it at this path                                                                                  |
| `/donation-confirmation/`, `/donation-failed/`, `/donation-history/`, `/donor-dashboard-2/` | `/support-nheg/`                                                       | GiveWP pages; giving goes to Zeffy ([#55](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/55))                   |
| `/volunteer-with-nheg/volunteer-portal/`                                                    | `/volunteer-with-nheg/`                                                | Password protected; its content was never public                                                                                         |
| `/community-news/heartfelt-thanks-special-offer-and-exciting-news-🌟/`                      | the same slug ending `-f0-9f-8c-9f/`                                   | The export spelled the emoji out                                                                                                         |
| `/school/caldera_forms_preview/`                                                            | `/school/caldera-forms-preview/`                                       | The export uses hyphens                                                                                                                  |

## At the DNS cutover (not applied)

The apex stays a DNS-only (grey cloud) GitHub Pages record, as `CLOUDFLARE_SETUP.md` requires, so Cloudflare never sees its traffic and no edge rule can run for it. That is why `/feed/` is handled by a stub above rather than a rule. Feed readers get an HTML page there, not a feed.

The three legacy subdomains are different: they will not point at GitHub Pages, so they can be **proxied** (orange cloud) without touching the apex certificate. Cloudflare then issues their edge certificate and a Single Redirect rule per host sends them on. Applied only with the cutover authorization on [#68: cutover](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/68).

| Proxied record                          | Redirect rule (wildcard pattern)                 | Target                                              | Status                                                   |
| --------------------------------------- | ------------------------------------------------ | --------------------------------------------------- | -------------------------------------------------------- |
| `school` (A `192.0.2.1`, proxied)       | `https://school.newheightseducation.org/*`       | `https://newheightseducation.org/school/${1}`       | 302 in the window, 301 after sign-off; query string kept |
| `publications` (A `192.0.2.1`, proxied) | `https://publications.newheightseducation.org/*` | `https://newheightseducation.org/publications/${1}` | 302 in the window, 301 after sign-off; query string kept |
| `radio` (A `192.0.2.1`, proxied)        | `https://radio.newheightseducation.org/*`        | `https://newheightseducation.org/radio/${1}`        | 302 in the window, 301 after sign-off; query string kept |

`192.0.2.1` is a documentation address: a proxied record needs a target, but the redirect answers before any origin is contacted. `www` needs no rule: with `www` as a DNS-only CNAME to `freeforcharity.github.io.`, GitHub Pages redirects it to the apex itself once its certificate covers both names.

The subdomain sections already live at those paths in the export, so a path-preserving rule is enough. The old `?page_id=` URLs ask for `/`, which serves the home page.

## Left as 404

These were already broken on the live site, so there is no page to send them to. They are listed for NHEG on [#22: broken internal links at source](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/22).

- `/who-we-are/nheg-magazine` and `/who-we-are/advertise-with-nheg` (the footer links)
- `/nheg-sitemap`
- `/education-news/classic-learning-test-2018-information/`
- `/nheg-radio-show/<host>/` pages
- `/checkout/`, `/wp-admin/`, `/wp-login.php`
