# Parked template E2E specs

These Playwright specs came from the FFC template and every test in each of
them asserts on the template's **home page** — content that workflow 706
replaces with the captured WordPress site. They are parked here beside the
template routes 706 parked for the same reason, rather than deleted, so the
FFC template's own history stays legible and a later rebrand can restore them.

706 predicted this and left it deliberately manual. Its `Report tests that
reference the parked routes` step writes to the run summary:

> `/` (the home page) was parked. Not searchable by path — a grep for "/"
> matches every test file — so check the target repo's home-page and smoke
> tests by hand.
>
> These will fail in the target repo's CI after delivery. Integration removes
> the template's app routes by design; the template's tests still assert them.

| spec                       | tests | why it is parked                                                                                                                                                                       |
| -------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `application-form.spec.ts` | 15    | The template's Microsoft Forms modal. 706 replaces every form with a `mailto:` block by design, because a static export has no form backend.                                           |
| `animated-numbers.spec.ts` | 5     | The "Results 2023" animated statistics section of the template home page.                                                                                                              |
| `mission-video.spec.ts`    | 3     | The click-to-play mission-video facade on the template home page. The component is only reachable from the parked route, so the spec fails whether or not `public/videos/` is present. |
| `logo.spec.ts`             | 3     | Two of three assert the template's hero-section image; the third pairs it with the header logo.                                                                                        |
| `image-loading.spec.ts`    | 2     | The template home page's hero image and local-asset loading.                                                                                                                           |
| `reduced-motion.spec.ts`   | 1     | Its only test is `Results-2023 stat numbers settle without a multi-frame animation`.                                                                                                   |

**Deliberately NOT parked**, because they test the migrated site rather than
the template, and their failures are real findings:

- `axe.spec.ts` — `homepage has no new serious or critical violations`. The
  home page still exists; it is the captured one. A failure here is an
  accessibility violation in the charity's markup, tracked in #16.
- `cookie-consent.spec.ts` — 15 of its 16 tests pass. The one that fails is
  about the modal overlay, not about anything the migration removed.

Parking a spec because its subject no longer exists is not the same as
silencing a failing test, and the line between them is the table above: if a
test here starts describing something the live site does have, it belongs back
in `tests/`.
