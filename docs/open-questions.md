# Open questions and concerns

Questions for NHEG and FFC that the migration cannot settle by itself, and known risks we have accepted for now. Add to this file as items come up; strike an item through and link the decision when it is resolved.

Status as of 2026-10-04. Overall progress is on [#85: migration status](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/85).

## Needs the site owners

1. **Who is NHEG's contact for site decisions?** Unknown. Every item in this section needs someone at NHEG who can answer it.
2. **How the forms work after launch.** The proposed decision record [`decisions/0001-form-handling.md`](./decisions/0001-form-handling.md) ([#92](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/pull/92)) compares the options and recommends Google Forms in NHEG's own Workspace. Several forms collect children's details and family income. Until the owners decide, every form shows the interim "This form has moved to email" block. Blocks [#53](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/53).
3. **Where do today's form submissions go?** Recipients and stored entries are only visible in the WordPress admin ([live archive README](./live-archive/2026-10-02/README.md)). Someone with admin access should export or note them before Bluehost lapses.
4. **A Google Classroom link for Learning Annex enrollment.** The nav's Enroll link was a private page (404) on the live site. It now goes to `/school/contact-us/` ([#93](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/pull/93)). If NHEG has a Classroom join link or enrollment page, Enroll should point there ([#56](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/56)).
5. **Two PayPal buttons were broken on the live site.** The tutoring fee and yearbook order forms had no PayPal button ID, so they now say "Contact us to arrange payment". If NHEG wants online payment there, it needs to provide working PayPal button IDs or another payment link.
6. **Does anything still use WordPress accounts?** The store work ([#54](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/54)) removes the cart, checkout and the 953 "My Account" links, since a static site has no accounts. NHEG's external tools (the tutorfly tutoring portal and the GiveBacks store) have their own sign-in and are unaffected.

## Accepted concerns

1. **The large videos stay in the site.** The export is 850 MB against GitHub Pages' 1 GB limit, and `verify:build` fails above 950 MB. Six videos over 10 MB make up about 250 MB of that (98, 55, 31, 25, 24 and 17 MB). Pagefind search ([#49](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/49)) and the archive pages ([#52](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/52)) have to fit in the remaining headroom of about 100 MB below the budget. If the budget fails, moving the videos to YouTube or a release is the first lever. Kept by decision on 2026-10-04 ([#43](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/43)).
2. **The restored PayPal buttons take real money.** The EdGuide ad and senior-photo buttons use the live site's button IDs and fields, which are pinned by tests. Someone should open each one after deploy and confirm it reaches the right PayPal item, without paying.
3. **The converter's fixes are not upstream yet.** Several fixes here (the production marker, stylesheet extensions, CSS scoping) were made in this repo's generated files. A workflow 706 re-run would undo them until [FFC-Cloudflare-Automation#1515](https://github.com/FreeForCharity/FFC-Cloudflare-Automation/issues/1515) lands. Tests in this repo fail if they regress.
4. **Most publication PDFs download from a GitHub release.** The 84 flipbook PDFs are 3.4 GB, more than GitHub Pages serves, so each flipbook page shows the issue cover and links to its PDF in the [`publications-pdfs-2026-10-04`](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/releases/tag/publications-pdfs-2026-10-04) release ([#51](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/51)). Those links download the file rather than opening a page-turning reader. The 7 PDFs the site already serves open in the browser. A hosted reader (for example Issuu, or an R2 bucket behind the domain) would need NHEG's decision and an account.

## Waiting for a go-ahead

1. **Legacy URL redirects** ([#59](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/59)) and **CNAME staging** ([#65](https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/issues/65)): staging was approved on 2026-10-04 and then deferred, so confirm the go-ahead again before starting either. Neither is merged, and DNS is not changed, without explicit authorization.
2. **DNS move and Bluehost cancellation:** tracked on [FFC-Cloudflare-Automation#1342](https://github.com/FreeForCharity/FFC-Cloudflare-Automation/issues/1342). Bluehost must not be cancelled before the zone moves and mail is verified.
