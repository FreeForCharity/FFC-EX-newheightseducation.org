# Parked FFC template code

Everything under this directory came from the FFC single-page template and has
no route on this site. `/` is New Heights Educational Group's own captured
WordPress home page (`src/app/page.tsx` renders `src/clone-content/index.html`),
so the template's home-page sections — its hero, its mission block, its FAQ,
its endowment cards, its "Support Free For Charity" panel — are assembled by
`app/home-page/index.tsx`, which **nothing imports**. A reachability walk from
every real route (`page.tsx` / `layout.tsx` / `route.ts` under `src/app`)
reaches none of them.

They are parked here rather than deleted, following the convention `tests/`
already set (see [`tests/README.md`](tests/README.md)): workflow 706 parked the
template's `privacy-policy` route and its home-page E2E specs for exactly this
reason, so the template's history stays legible and a later rebrand can restore
any of it.

## Why parking, and not editing in place

`pnpm run check:drift` compares the repo against the template once
`siteConfig.name` differs, and it reported 41 findings in these files — Free
For Charity's name, its EIN `46-2471893`, its freeforcharity.org URLs. Those are
not values that can be corrected: they are FFC's own program copy describing
what FFC does. Rewriting them as New Heights Educational Group's would be
inventing content for a page no visitor can reach. Removing the files from
`src/` is what makes the check's verdict true again.

## What is here

| path                                                        | what it is                                                                                                                                                              |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/home-page/`                                        | The template home page's section assembly — the file that imported everything else here.                                                                                |
| `src/components/home-page/`                                 | Ten marketing sections: Hero, Mission, FAQ, Endowment-Features, Our-Programs, Results-2023, SupportFreeForCharity, Testimonials, Team, Volunteer.                       |
| `src/components/ui/`                                        | Seven presentational components used only by those sections (cards, accordion, animated counter, form button).                                                          |
| `src/components/seo/FaqSchema.tsx`                          | FAQPage JSON-LD built from the template's FAQ. `OrganizationSchema` and `WebsiteSchema` are **not** parked — they describe the charity and the layout now renders them. |
| `src/data/faqs.ts`, `src/data/faqs/`, `src/data/results.ts` | FFC's FAQ answers and its 2023 impact statistics. No remaining consumer in `src/`.                                                                                      |
| `src/hooks/`                                                | `useIntersectionObserver` and `useReducedMotion`, used only by the parked sections.                                                                                     |
| `__tests__/`                                                | The unit tests for all of the above, moved with their subjects.                                                                                                         |
| `tests/`                                                    | The template's home-page E2E specs, parked earlier by 706.                                                                                                              |

## What deliberately stayed in `src/`

- **`components/home-page/Events/` and `lib/events/`** — a real feature, not
  template copy. It self-hides (`eventsSectionVisible()`) until a calendar
  source is configured, so it renders nothing today and costs nothing.
- **`data/team.ts` + `data/team/*.json`, `data/testimonials.ts` +
  `data/testimonials/*.json`** — the Header and Footer read `configuredTeam` to
  decide whether to show a "Team" link. Their JSON slots are **blanked** rather
  than parked, which is the fork path the template documents
  (`__tests__/data/configured-data.test.ts`): a blank slot drops out of the
  `configured*` view, and the nav link self-hides instead of pointing at a
  `#team` anchor no page renders.

## How it is kept out of the build

Parked code must not gate this site's CI, so three configs exclude it by path:
`tsconfig.json` (`exclude`), `eslint.config.mjs` (`ignores`) and
`jest.config.js` (`testPathIgnorePatterns`). The tests keep their `__tests__`
layout so they can be restored verbatim, which is why jest has to exclude them
by path rather than by name.

**Parking code because its subject no longer exists is not the same as deleting
a failing check.** If anything here starts describing something this site does
have, it belongs back in `src/`.
