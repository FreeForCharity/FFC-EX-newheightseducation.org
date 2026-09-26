import {
  normalizeText,
  visibleText,
  extractTitle,
  extractHeadings,
  similarity,
  titleSimilarity,
  leadingSegment,
  degenerateTitles,
  looksLikeTheExport,
  sourceUrlFor,
  sampleRoutes,
  comparePages,
  MIN_TITLE_SIMILARITY,
} from '../../scripts/verify-fidelity.mjs'

/**
 * The fidelity check compares the deployed export against the SOURCE site.
 * Its network half cannot be exercised here — this sandbox cannot reach
 * newheightseducation.org, which is the whole reason the check has to live in
 * CI. So everything that decides an outcome is a pure function, and this is
 * where those decisions are pinned.
 */

describe('normalizeText', () => {
  // 706 unescapes WordPress's magic-quotes legacy on purpose. If the
  // comparison did not do the same, the pipeline's own correction would be
  // reported as the export being unfaithful to the source.
  it('treats a magic-quotes apostrophe as the apostrophe it becomes', () => {
    expect(normalizeText("What\\'s Wrong With Fitness Magazines?")).toBe(
      normalizeText("What's Wrong With Fitness Magazines?")
    )
  })

  it('treats an entity and its character as the same text', () => {
    expect(normalizeText('Parents &amp; Teachers')).toBe(normalizeText('Parents & Teachers'))
    expect(normalizeText('It&#8217;s here')).toBe(normalizeText('It’s here'))
  })

  it('collapses whitespace and case', () => {
    expect(normalizeText('  Who   We\nAre  ')).toBe('who we are')
  })

  it('survives a non-string rather than throwing', () => {
    expect(normalizeText(undefined as unknown as string)).toBe('')
  })
})

describe('visibleText', () => {
  it('drops script and style bodies', () => {
    const html = '<style>.a{color:red}</style><p>Real words</p><script>var x = "hidden"</script>'
    expect(visibleText(html)).toBe('real words')
  })

  it('drops comments', () => {
    expect(visibleText('<p>kept</p><!-- dropped -->')).toBe('kept')
  })
})

describe('extractTitle / extractHeadings', () => {
  it('reads the title', () => {
    expect(extractTitle('<html><head><title>Who We Are</title></head></html>')).toBe('who we are')
  })

  it('reads h1 and h2 text without their markup', () => {
    expect(extractHeadings('<h1>A <span>B</span></h1><h3>skip</h3><h2>C</h2>')).toEqual([
      'a b',
      'c',
    ])
  })
})

describe('similarity', () => {
  it('scores the same title 1', () => {
    expect(similarity('Who We Are', 'who we are')).toBe(1)
  })

  it('scores two empty strings 1 and one empty string 0', () => {
    expect(similarity('', '')).toBe(1)
    expect(similarity('anything', '')).toBe(0)
  })
})

describe('titleSimilarity', () => {
  // The two cases the whole design turns on. Whole-title Jaccard scores them
  // 0.400 and 0.375 -- adjacent, and on the wrong side of any single bar.
  // Comparing leading segments separates them completely, which is why
  // `titleSimilarity` exists rather than `similarity` being used directly.
  it('scores the #1370 shape zero: the export served a different page', () => {
    const score = titleSimilarity(
      'Student Support Services | New Heights Educational Group | Ohio',
      'New Heights Educational Group Publications'
    )
    expect(score).toBe(0)
    expect(score).toBeLessThan(MIN_TITLE_SIMILARITY)
  })

  it('scores a dropped site-name suffix 1: that is not a fidelity problem', () => {
    const score = titleSimilarity('Who We Are | New Heights Educational Group', 'Who We Are')
    expect(score).toBe(1)
    expect(score).toBeGreaterThanOrEqual(MIN_TITLE_SIMILARITY)
  })

  it('falls back to the whole title when neither side has a separator', () => {
    expect(titleSimilarity('Who We Are', 'Who We Are')).toBe(1)
    expect(titleSimilarity('Who We Are', 'Shopping Cart')).toBe(0)
  })

  // The documented blind spot, pinned so it cannot be mistaken for a bug
  // later and "fixed" into something that breaks the two cases above.
  // `degenerateTitles` is what makes it visible; see below.
  it('IS blind to a site-first theme, by construction', () => {
    expect(titleSimilarity('NHEG | Who We Are', 'NHEG | Publications')).toBe(1)
  })
})

describe('leadingSegment', () => {
  it.each([
    ['A | B', 'a'],
    ['A \u2013 B', 'a'],
    ['A - B', 'a'],
    ['A \u00b7 B', 'a'],
    ['No separator here', 'no separator here'],
    ['Well-known hyphen kept', 'well-known hyphen kept'],
  ])('%s -> %s', (input, expected) => {
    expect(leadingSegment(input)).toBe(expected)
  })
})

describe('degenerateTitles', () => {
  // Turns titleSimilarity's blind spot into something the run reports.
  it('detects a site-first theme, where every leading segment is the same', () => {
    expect(degenerateTitles(['NHEG | A', 'NHEG | B', 'NHEG | C'])).toBe(true)
  })

  it('does not fire on page-first titles', () => {
    expect(degenerateTitles(['A | NHEG', 'B | NHEG', 'C | NHEG'])).toBe(false)
  })

  it('does not fire on too small a sample to tell', () => {
    expect(degenerateTitles(['NHEG | A', 'NHEG | B'])).toBe(false)
  })
})

describe('looksLikeTheExport', () => {
  // The guard that stops this check reporting a perfect score forever once DNS
  // cuts over and the source domain starts serving the export.
  it('recognises the clone wrapper the FFC build emits', () => {
    expect(looksLikeTheExport('<div class="ffc-clone home page-id-3410">x</div>')).toBe(true)
  })

  it('recognises the FFC footer class', () => {
    expect(looksLikeTheExport('<footer class="ffc-footer">x</footer>')).toBe(true)
  })

  // The marker must be a CLASS, never the phrase. FFC builds these sites, so a
  // charity crediting its sponsor in a footer would otherwise trip the guard
  // and the check would refuse to run, reporting a cutover that never
  // happened. This shipped as a free-text match for one commit.
  it('does NOT fire on a source that merely credits Free For Charity in text', () => {
    expect(looksLikeTheExport('<footer>Website donated by Free For Charity</footer>')).toBe(false)
  })

  it('does not fire on an ordinary WordPress page', () => {
    expect(
      looksLikeTheExport('<body class="home wp-singular page-template-default">x</body>')
    ).toBe(false)
  })

  it('does not fire on a class that merely contains the substring', () => {
    expect(looksLikeTheExport('<div class="not-ffc-cloned">x</div>')).toBe(false)
  })
})

describe('sourceUrlFor', () => {
  it('maps a route 1:1 for an unmounted capture', () => {
    expect(sourceUrlFor('/who-we-are/', 'https://example.org')).toBe(
      'https://example.org/who-we-are/'
    )
  })

  it('tolerates a trailing slash on the origin', () => {
    expect(sourceUrlFor('/a/', 'https://example.org/')).toBe('https://example.org/a/')
  })

  // A mounted capture puts the source's `/x/` at the export's `/school/x/`,
  // so the mount has to come back off or every comparison 404s at the source.
  it('strips the mount from a mounted capture', () => {
    expect(sourceUrlFor('/school/algebra-i/', 'https://example.org', 'school')).toBe(
      'https://example.org/algebra-i/'
    )
  })

  it('maps the mount root to the source root', () => {
    expect(sourceUrlFor('/school/', 'https://example.org', 'school')).toBe('https://example.org/')
  })

  it('leaves a route outside the mount alone', () => {
    expect(sourceUrlFor('/other/', 'https://example.org', 'school')).toBe(
      'https://example.org/other/'
    )
  })
})

describe('sampleRoutes', () => {
  const routes = ['/', ...Array.from({ length: 99 }, (_, i) => `/p${i}/`)]

  it('always includes the front page', () => {
    expect(sampleRoutes(routes, 5)).toContain('/')
  })

  it('returns everything when the sample is larger than the route list', () => {
    expect(sampleRoutes(['/', '/a/'], 25)).toEqual(['/', '/a/'])
  })

  // Deterministic, not random: a run that samples different pages each time
  // cannot be compared with the one before it, and the soft thresholds only
  // become thresholds once several runs agree.
  it('picks the same pages every time', () => {
    expect(sampleRoutes(routes, 10)).toEqual(sampleRoutes(routes, 10))
  })

  it('spreads across the list rather than taking a prefix', () => {
    const picked = sampleRoutes(routes, 5).filter((r) => r !== '/')
    expect(picked).not.toEqual(['/p0/', '/p1/', '/p2/', '/p3/'])
    expect(new Set(picked).size).toBe(picked.length)
  })
})

describe('comparePages', () => {
  const page = (title: string, text: string, headings: string[] = []) => ({
    title: normalizeText(title),
    text: normalizeText(text),
    headings: headings.map(normalizeText),
  })
  const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ')

  it('passes a faithful page', () => {
    const r = comparePages('/a/', page('Who We Are', words(200)), page('Who We Are', words(200)))
    expect(r.findings).toEqual([])
    expect(r.titleScore).toBe(1)
  })

  // The defect this check exists for.
  it('fails when the export serves a different page than the source', () => {
    const r = comparePages(
      '/',
      page('Student Support Services | New Heights Educational Group | Ohio', words(300)),
      page('New Heights Educational Group Publications', words(300))
    )
    expect(r.findings.join(' ')).toMatch(/different page/)
  })

  it('fails when the export kept almost none of the text', () => {
    const r = comparePages('/a/', page('Same Title', words(500)), page('Same Title', words(20)))
    expect(r.findings.join(' ')).toMatch(/kept 4% of the source/)
  })

  // A short source page is not evidence of anything — a 12-word page losing
  // three words is noise, and failing on it would make the check unusable.
  it('does not fail a short page on the text ratio', () => {
    const r = comparePages('/a/', page('Same Title', words(12)), page('Same Title', words(2)))
    expect(r.findings).toEqual([])
  })

  it('reports heading overlap without failing on it', () => {
    const r = comparePages(
      '/a/',
      page('Same Title', words(200), ['Alpha', 'Beta']),
      page('Same Title', words(200), ['Alpha'])
    )
    expect(r.sourceHeadings).toBe(2)
    expect(r.keptHeadings).toBe(1)
    expect(r.findings).toEqual([])
  })

  it('does not fail on a title the source itself does not have', () => {
    const r = comparePages('/a/', page('', words(200)), page('Anything', words(200)))
    expect(r.findings).toEqual([])
  })
})
