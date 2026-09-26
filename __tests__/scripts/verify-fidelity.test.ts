import {
  normalizeText,
  visibleText,
  extractTitle,
  extractHeadings,
  similarity,
  titleSimilarity,
  leadingSegment,
  hasTitleSeparator,
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

  // `</script >` closes a script element -- HTML allows whitespace before the
  // `>`. A pattern requiring the bare form does not match it and leaves the
  // whole script BODY in the visible text, which inflates the word count that
  // `comparePages` fails on, in the passing direction. Each of these returned
  // 'real var leaked=1;' before the fix. CodeQL js/bad-tag-filter, #33.
  it.each([
    ['bare', '</script>'],
    ['space', '</script >'],
    ['newline', '</script\n>'],
    ['tab', '</script\t>'],
    ['self-closing slash', '</script/>'],
    ['attributes', '</script foo="bar">'],
    ['whitespace then attributes', '</script\t\n bar>'],
  ])('drops a script body closed with a %s end tag', (_label, close) => {
    expect(visibleText(`<p>real</p><script>var leaked=1;${close}`)).toBe('real')
  })

  // The other direction, and the reason the pattern is `[\s/][^>]*` rather
  // than the easier `[^>]*`: `</scriptfoo>` does NOT close a script element.
  // A browser keeps parsing JavaScript past it, so treating it as a close
  // would start counting real script as visible text -- the same defect the
  // cases above describe, reached by over-matching instead of under-matching.
  it.each([['</scriptfoo>'], ['</scripty>']])('does not treat %s as a script end tag', (close) => {
    expect(visibleText(`<p>real</p><script>var leaked=1;${close}`)).toBe('real var leaked=1;')
  })

  it.each([
    ['style', '<style>.a{color:red}</style >'],
    ['noscript', '<noscript>hidden words</noscript >'],
    ['style with attributes', '<style>.a{color:red}</style media=all>'],
  ])('drops a %s body closed with a spaced end tag', (_label, markup) => {
    expect(visibleText(`<p>real</p>${markup}`)).toBe('real')
  })
})

describe('extractTitle / extractHeadings', () => {
  it('reads the title', () => {
    expect(extractTitle('<html><head><title>Who We Are</title></head></html>')).toBe('who we are')
  })

  // Same whitespace-before-`>` rule as visibleText. A missed title match is
  // not silent here: `comparePages` skips the title assertion entirely when
  // the source title is empty, so the ONE check that caught #1370 would have
  // turned itself off for any page whose theme emits `</title >`.
  it.each([['</title>'], ['</title >'], ['</title\n>'], ['</title lang=en>']])(
    'reads a title closed with %s',
    (close) => {
      expect(extractTitle(`<title>Who We Are${close}`)).toBe('who we are')
    }
  )

  it('reads headings closed with whitespace or attributes in the end tag', () => {
    expect(extractHeadings('<h1>A</h1 ><h2>B</h2\n><h1>C</h1 class=x>')).toEqual(['a', 'b', 'c'])
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

  // Same suffix drop as above, with a theme that writes its separator with
  // no surrounding spaces. This scored 0.286 and FAILED -- below the 0.5 bar
  // -- while the spaced spelling of the identical title scored 1.
  it('scores a dropped suffix 1 when the separator has no spaces', () => {
    expect(titleSimilarity('Who We Are\u2014New Heights Educational Group', 'Who We Are')).toBe(1)
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
    // Unspaced separators. `normalizeText` folds \u2013 and \u2014 to `-`, so reading
    // the separator AFTER normalizing made both dash branches dead code and
    // `A\u2014B` came back as the single segment `a-b`. The bare hyphen still
    // needs its spaces, which is what keeps `Well-known` above intact.
    ['A|B', 'a'],
    ['A\u2013B', 'a'],
    ['A\u2014B', 'a'],
    ['A\u00b7B', 'a'],
  ])('%s -> %s', (input, expected) => {
    expect(leadingSegment(input)).toBe(expected)
  })
})

describe('hasTitleSeparator', () => {
  it.each([
    ['A | B', true],
    ['A\u2014B', true],
    ['A - B', true],
    ['Well-known hyphen kept', false],
    ['No separator here', false],
  ])('%s -> %s', (input, expected) => {
    expect(hasTitleSeparator(input)).toBe(expected)
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

  // Every legal spelling of the attribute. A guard that misses one does not
  // fail loudly -- it lets the run compare the export against itself and
  // report perfect fidelity forever, which is the one outcome this function
  // exists to prevent. All three of these returned false at first.
  it.each([
    ["<div class='ffc-clone home'>x</div>", 'single quotes'],
    ['<div class = "ffc-clone">x</div>', 'spaces around ='],
    ['<div class=ffc-clone>x</div>', 'unquoted'],
  ])('fires on %s', (html) => {
    expect(looksLikeTheExport(html)).toBe(true)
  })

  // `\bffc-clone\b` matches here, because `-` ends a word. Class attributes
  // are whitespace-separated tokens, so the boundaries have to be whitespace.
  it('does not fire on a longer class that starts with the marker', () => {
    expect(looksLikeTheExport('<div class="ffc-clone-wrapper">x</div>')).toBe(false)
  })

  // The same `\b` mistake one level up, and it was introduced by the fix for
  // the one above: `\bclass` matches inside `data-class` too. It fails the
  // opposite way -- a cutover reported that never happened, and the run
  // refuses to score anything.
  it.each([
    ['<div data-class="ffc-clone">x</div>', 'data-class'],
    ['<div xml:class="ffc-clone">x</div>', 'a namespaced attribute'],
    ['<div myclass="ffc-clone">x</div>', 'a suffixed attribute'],
  ])('does not fire on %s', (html) => {
    expect(looksLikeTheExport(html)).toBe(false)
  })

  it('still fires on a real class beside a decoy data-class', () => {
    expect(looksLikeTheExport('<div data-class="x" class="ffc-clone home">y</div>')).toBe(true)
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
