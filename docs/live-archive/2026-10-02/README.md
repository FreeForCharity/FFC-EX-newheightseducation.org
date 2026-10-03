# Live site archive, 2026-10-02

What the migration still needed from the four live WordPress hosts before Bluehost hosting lapses ([#41](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/41)). The hosts are `newheightseducation.org`, `school.`, `publications.` and `radio.`. Everything was taken read-only on 2026-10-02, between 07:15 and 11:00 EDT.

Small JSON maps are in this folder. Large files are release assets:

- [`live-archive-2026-10-02`](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/releases/tag/live-archive-2026-10-02): pages and PDF originals. Its screenshot zip is superseded; it missed lazy-loaded images.
- [`live-archive-2026-10-02-screenshots`](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/releases/tag/live-archive-2026-10-02-screenshots): screenshots, each page scrolled before capture.
- [`live-archive-2026-10-02-media`](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/releases/tag/live-archive-2026-10-02-media): media libraries and wp-json.

## What was taken

| Item                     | Where                                                                                                  | Source                                                                                                            | Used by                                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rendered HTML, 999 pages | `live-html-2026-10-02.zip`                                                                             | Each host's Yoast sitemap plus `wp/v2/pages` and `wp/v2/posts`, and each archive's `/page/N/` pages (186 of them) | [#52](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/52), [#62](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/62) |
| Screenshots, 108         | `live-screenshots-2026-10-02-scrolled.zip`                                                             | 36 URLs, one per template and section, full page at 1440, 768 and 390 px, scrolled first so lazy images load      | [#62](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/62)                                                                                    |
| Flipbook sources, 84     | [`dflip-sources.json`](./dflip-sources.json)                                                           | The inline `df_option_*` object on each `publications.` book page                                                 | [#51](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/51)                                                                                    |
| Forms, 130               | [`forms.json`](./forms.json)                                                                           | Every `<form>` in the rendered HTML: action, fields, labels, required flags and options                           | [#53](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/53)                                                                                    |
| Products, 94             | [`products.json`](./products.json)                                                                     | `wc/store/v1/products`, with all 1,220 variations                                                                 | [#54](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/54)                                                                                    |
| Media libraries, 2,091   | `media-*.zip`, listed in [`media-manifest.<host>.json`](./media-manifest.newheightseducation.org.json) | `wp/v2/media`, saving the original upload where WordPress also kept a scaled copy                                 | [#50](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/50)                                                                                    |
| Page and post content    | `live-wp-json-2026-10-02.zip`                                                                          | `wp/v2/pages` and `wp/v2/posts` for each host, including `radio.`                                                 | [#46](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/46)                                                                                    |
| PDF originals, 134       | `pdf-originals-capture-36334776020.zip`                                                                | The capture artifact of Actions run 36334776020, taken before it expired on 2026-10-04                            | [FFC-Cloudflare-Automation#1399](https://github.com/FreeForCharity/FFC-Cloudflare-Automation/issues/1399)                                                            |

Every media file and flipbook PDF has a `sha256` and a byte count in its manifest.

## Things to know

- **Flipbook PDFs.**
  - Only 7 of the 84 are in the [#40](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/pull/40) capture. All 84 are in `media-publications.newheightseducation.org-*.zip`.
  - `dflip-sources.json` maps each book page to its PDF, its expected path under `_ffc-assets/` and its hash.
- **The media API hides some items.**
  - `wp/v2/media` reports 1,670, 279 and 245 items on apex, school and publications, but returns 1,513, 245 and 158.
  - The difference is attachments of unpublished or non-public posts. The flipbook PDFs were among them, which is why they were downloaded from their `df_option` URLs instead.
- **Form recipients aren't public.**
  - `forms.json` has what a visitor sees. There are 14 distinct Caldera forms: 6 on the apex, 7 on school and 1 on radio. The other entries are search, store, PayPal and sign-in forms.
  - Where each form's submissions go is only in the WordPress admin. It's asked on [#42](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/42) for [#53](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/53).
- **One page returned 500:** `publications.newheightseducation.org/local-portfolio/`. Its status is recorded in `html/<host>.json` inside the HTML zip.
- **Bluehost rate limiting.** After about 1,000 requests, Bluehost answered with a cookie challenge (HTTP 409) for about half an hour. The media pass ran afterwards at one request every 2 seconds.

## How to re-run

The live site has to still be up. From the repo root:

```bash
node scripts/archive-live-site.mjs --data docs/live-archive/<date> --out <dir>
node scripts/archive-live-screenshots.mjs <dir>/screenshots
```

Already-saved pages and media are reused. `ARCHIVE_POOL` and `ARCHIVE_GAP_MS` set the concurrency and the delay between requests.
