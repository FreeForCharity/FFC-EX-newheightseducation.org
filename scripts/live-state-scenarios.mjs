/**
 * What compare-live-states.mjs drives on both sides. `state` entries are read
 * on each side (`ROOT` is the live body / the export's .ffc-clone), `clip` is
 * the region screenshotted and whose visible links must match, `maxDiff` the
 * pixel limit (omit it to record the score without judging it). `scroll: false`
 * skips the lazy-image scroll pass, which leaves Jupiter's sticky header in a
 * different state on each side.
 */
const PUBLICATIONS = 'https://publications.newheightseducation.org'
const SCHOOL = 'https://school.newheightseducation.org'
const APEX = 'https://newheightseducation.org'

const ASTRA_STATE = [
  { sel: 'ROOT', classes: ['ast-desktop', 'ast-header-break-point', 'ast-main-header-nav-open'] },
  { sel: '#ast-mobile-header .menu-toggle', classes: ['toggled'] },
  { sel: '#ast-mobile-header .ast-mobile-header-content' },
  { sel: '#ast-mobile-header .menu-item-has-children', classes: ['ast-submenu-expanded'] },
  { sel: '#ast-mobile-header .menu-item-has-children > .ast-menu-toggle' },
  { sel: '#ast-mobile-header .menu-item-has-children > .sub-menu' },
]
const ASTRA_TOGGLE = '#ast-mobile-header .menu-toggle'
const ASTRA_ARROW = '#ast-mobile-header .menu-item-has-children > .ast-menu-toggle'
const ASTRA_PAGES = {
  'pub-home': `${PUBLICATIONS}/`,
  'pub-post': `${PUBLICATIONS}/nheg-edguide-september-october-2026/`,
  'pub-category': `${PUBLICATIONS}/category/nheg-edguide/2015-nheg-edguide/`,
}
const SMALL = ['phone', 'tablet']

const astra = Object.entries(ASTRA_PAGES).flatMap(([name, url]) => {
  const base = { url, clip: ['#masthead'], state: ASTRA_STATE, maxDiff: 0.005, scroll: false }
  return [
    { ...base, name: `${name}-menu-closed`, viewports: [...SMALL, 'desktop'] },
    { ...base, name: `${name}-menu-open`, viewports: SMALL, steps: [{ click: ASTRA_TOGGLE }] },
    {
      ...base,
      name: `${name}-menu-sub-open`,
      viewports: SMALL,
      steps: [{ click: ASTRA_TOGGLE }, { click: ASTRA_ARROW }],
    },
    {
      ...base,
      name: `${name}-menu-reclosed`,
      viewports: ['phone'],
      steps: [{ click: ASTRA_TOGGLE }, { click: ASTRA_ARROW }, { click: ASTRA_TOGGLE }],
    },
    {
      ...base,
      name: `${name}-menu-keyboard`,
      viewports: ['phone'],
      steps: [
        { press: 'Enter', on: ASTRA_TOGGLE },
        { press: 'Enter', on: ASTRA_ARROW },
      ],
    },
    {
      ...base,
      name: `${name}-menu-hover`,
      viewports: ['desktop'],
      clip: ['#masthead', '#ast-desktop-header .menu-item-has-children > .sub-menu'],
      state: [{ sel: '#ast-desktop-header .menu-item-has-children > .sub-menu' }],
      steps: [{ hover: '#ast-desktop-header .menu-item-has-children' }],
    },
  ]
})

const jupiterDropdown = (name, url, ids) => {
  const id = ids.at(-1)
  return [
    {
      name: `${name}-hover`,
      url,
      viewports: ['desktop'],
      clip: [`#menu-item-${ids[0]}`, ...ids.map((i) => `#menu-item-${i} > .sub-menu`)],
      state: ids.map((i) => ({ sel: `#menu-item-${i} > .sub-menu` })),
      steps: ids.map((i) => ({ hover: `#menu-item-${i}` })),
      maxDiff: 0.005,
      scroll: false,
    },
    {
      name: `${name}-phone`,
      url,
      viewports: ['phone'],
      clip: ['.mk-responsive-wrap'],
      state: [{ sel: '.mk-responsive-wrap' }, { sel: `#responsive-menu-item-${id} > .sub-menu` }],
      steps: [
        { click: '.mk-nav-responsive-link' },
        ...ids.map((i) => ({ click: `#responsive-menu-item-${i} > .mk-nav-arrow` })),
      ],
      maxDiff: 0.005,
      scroll: false,
    },
  ]
}

const COURSES = [
  'online-courses/',
  'online-courses/algebra-i/',
  'online-courses/animation-course/',
  'online-courses/chemistry/',
  'online-courses/discounted-and-free-online-classes/',
  'online-courses/drawing-course/',
  'online-courses/essential-to-pianos-techniques/',
  'online-courses/financial-literacy/',
  'online-courses/genealogy-dna-course/',
  'online-courses/generation-self-employed/',
  'online-courses/holidays-around-the-world/',
  'online-courses/how-to-become-a-internet-radio-host/',
  'online-courses/interview-skills/',
  'online-courses/learn-to-read/',
  'online-courses/learning-chinese/',
  'online-courses/learning-japanese/',
  'online-courses/music-program/',
  'online-courses/music-program/music-composers/',
  'online-courses/music-program/online-piano-course/',
  'online-courses/natural-speller/',
  'online-courses/orphan-train-movement/',
  'online-courses/personal-and-professional-development-coaching/',
  'online-courses/personal-development-coaching-courses/',
  'online-courses/personal-development-coaching-courses/page/2/',
  'online-courses/pre-calculus/',
  'online-courses/writing-course/',
  'pre-algebra/',
  'pre-calculus/',
  'violin-vision/',
]

const courses = COURSES.map((path) => ({
  name: `course-${path.replace(/\/$/, '').replace(/\//g, '-')}`,
  url: `${SCHOOL}/${path}`,
  viewports: ['phone', 'desktop'],
  clip: ['#theme-page'],
}))

export const SCENARIOS = [
  ...astra,
  ...jupiterDropdown('apex-publications-menu', `${APEX}/contact-us/`, [13244]),
  ...jupiterDropdown('school-courses-menu', `${SCHOOL}/online-courses/`, [189, 7482]),
  ...courses,
]
