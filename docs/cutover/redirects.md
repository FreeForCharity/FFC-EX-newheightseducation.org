# Legacy URL redirects

How old newheightseducation.org URLs keep working after cutover, for [#59: legacy URL continuity](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/59). Every target below was checked against the live site on 2026-10-06.

## In this repo (done)

- **Links in the content:** `scripts/relink-legacy-urls.mjs` ([#116](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/pull/116)) points old links where the live site's redirects sent them.
- **Old URLs typed or bookmarked:** `scripts/write-legacy-stubs.mjs` writes a `noindex` meta-refresh page at each old path below. Targets are relative, so the stubs work at the github.io subpath and at the apex.

| Old path                                                 | Goes to                                       | Live behaviour                                                                                                                           |
| -------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `/page/2/` to `/page/64/`                                | `/`                                           | Rendered the front page for any page number                                                                                              |
| `/cart/`, `/my-account/`                                 | `/shop/`                                      | WooCommerce pages; the store is a static catalog now ([#54](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/54)) |
| `/parents/events/<event>/`                               | `/events/<event>/`                            | 301                                                                                                                                      |
| `/nheg-parents/nheg-home-charter-school-events/<event>/` | `/events/<event>/`                            | 301                                                                                                                                      |
| `/who-we-are/books/<book>/`                              | `/who-we-are/nheg-books/<book>/`              | 301                                                                                                                                      |
| `/nheg-programs/<program>/`                              | `/nheg-educational-programs/<program>/`       | 301                                                                                                                                      |
| `/nheg-news/nheg-recognition-day-2017/`                  | `/nheg-news/nheg-recognition-day-2017-event/` | 301                                                                                                                                      |
| `/nheg-radio-show/`                                      | `/category/nheg-radio-show/`                  | 200, with that canonical                                                                                                                 |

## At the DNS cutover (not applied)

A static site cannot redirect another host or answer for an XML feed, so these need edge rules. They are applied only with the cutover authorization on [#68: cutover](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/68).

| From                                             | To                                                | Status         |
| ------------------------------------------------ | ------------------------------------------------- | -------------- |
| `https://school.newheightseducation.org/*`       | `https://newheightseducation.org/school/$1`       | 301, path kept |
| `https://publications.newheightseducation.org/*` | `https://newheightseducation.org/publications/$1` | 301, path kept |
| `https://radio.newheightseducation.org/*`        | `https://newheightseducation.org/radio/$1`        | 301, path kept |
| `https://www.newheightseducation.org/*`          | `https://newheightseducation.org/$1`              | 301, path kept |
| `/feed/`                                         | `/nheg-blog/`                                     | 301            |

The subdomain sections already live at those paths in the export, so a path-preserving rule is enough. The old `?page_id=` URLs ask for `/`, which serves the home page.

## Left as 404

These were already broken on the live site, so there is no page to send them to. They are listed for NHEG on [#22: broken internal links at source](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/22).

- `/who-we-are/nheg-magazine`, `/who-we-are/advertise-with-nheg` and `/?page_id=203` (the footer and "Advertise With NHEG" links)
- `/nheg-sitemap`
- `/education-news/classic-learning-test-2018-information/`
- `/nheg-radio-show/<host>/` pages
- `/checkout/`, `/wp-admin/`, `/wp-login.php`
