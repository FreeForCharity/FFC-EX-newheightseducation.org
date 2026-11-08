// NHEG flipbook viewer: a 3D page-turning book (three.js), built for this site.
import {
  AmbientLight,
  BackSide,
  BoxGeometry,
  CanvasTexture,
  DataTexture,
  DirectionalLight,
  FrontSide,
  Group,
  ImageBitmapLoader,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshPhongMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShadowMaterial,
  SRGBColorSpace,
  Texture,
  Vector3,
  WebGLRenderer,
} from 'three'
import ICONS from './icons.js'

// Look-and-feel parameters, chosen to match the old site's viewer.
const P = {
  fov: 20,
  duration: 800,
  flex: 0.7,
  shrinkPct: 10,
  shrinkPeak: 105,
  segments: 150,
  shininess: 15,
  ambient: 0.82,
  light: 0.22,
  lightPos: [-220, 220, 550],
  shadowOpacity: 0.1,
  zoomRatio: 1.5,
  maxZoom: 4,
  padding: 20,
  boardColor: 0xaaaaaa,
  boardExtra: 0.02,
}

// Visitors who ask for less motion get page turns without the animation.
const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
const easeInOutQuad = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
const smooth = (t) => t * t * (3 - 2 * t)
const smoothstepR = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
// Share of the half-turn (0..1) the sheet has made for a cursor at cx.
const turnShare = (cx) => {
  const t = Math.max(-1, Math.min(1, cx))
  if (t >= 0.7) return 0
  if (t >= 0) {
    const e = (0.7 - t) / 0.7
    return (1.6 * e * e - 0.6 * e * e * e) / 3
  }
  return 1 / 3 - (2 / 3) * t
}
// Near the outer edge the fold can only reach so far up the page: pairs of
// (cx, cy) bounding where the pivot may sit.
const CURL_ROWS = (() => {
  const G = [
    [1, 1],
    [0.9, 0.6],
    [0.8, 0.4],
    [0.7, 0.3],
    [0.6, 0.25],
    [0.45, 0],
  ]
  const lerp = (x, a, b, i, o) => {
    for (let k = 0; k < G.length - 1; k++) {
      const p = G[k],
        q = G[k + 1]
      if (x <= p[i] && x >= q[i]) return p[o] + (q[o] - p[o]) * ((p[i] - x) / (p[i] - q[i]))
    }
    return null
  }
  return {
    cyFor: (cx) => (cx >= 1 ? 1 : (lerp(cx, 0, 0, 0, 1) ?? 0)),
    cxFor: (cy) => (cy >= 1 ? 1 : cy <= 0 ? 0.45 : (lerp(cy, 0, 0, 1, 0) ?? 0.45)),
  }
})()
const icon = (n) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`

// A page turn: a soft tick as the page lifts, a quiet high rustle while it
// travels, then a slap as it lands whose pitch falls from about 3 kHz to 1.6 kHz.
export function paperTurn(ac, out, t0) {
  const sr = ac.sampleRate
  const noise = (sec) => {
    const b = ac.createBuffer(1, Math.ceil(sr * sec), sr),
      d = b.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    const s = ac.createBufferSource()
    s.buffer = b
    return s
  }
  const voice = (start, sec, filters, env) => {
    const src = noise(sec),
      g = ac.createGain()
    let node = src
    for (const [type, f, q, f2] of filters) {
      const bq = ac.createBiquadFilter()
      bq.type = type
      bq.Q.value = q
      bq.frequency.setValueAtTime(f, t0 + start)
      if (f2) bq.frequency.exponentialRampToValueAtTime(f2, t0 + start + sec)
      node = node.connect(bq)
    }
    g.gain.setValueAtTime(0, t0 + start)
    for (const [dt, v] of env) g.gain.linearRampToValueAtTime(v, t0 + start + dt)
    node.connect(g).connect(out)
    src.start(t0 + start)
    src.stop(t0 + start + sec + 0.02)
  }
  // Rustle bed, 2-12 kHz, centred near 5 kHz, with uneven crackle.
  const bedEnv = [[0.02, 0.008]]
  for (let t = 0.04; t < 0.3; t += 0.02)
    bedEnv.push([t, (t > 0.22 ? 0.014 : 0.008) + Math.random() * 0.01])
  bedEnv.push([0.32, 0.03], [0.34, 0])
  voice(
    0.08,
    0.34,
    [
      ['highpass', 2200, 0.7],
      ['lowpass', 7000, 0.6],
    ],
    bedEnv
  )
  // Lift tick.
  voice(
    0.125,
    0.02,
    [['bandpass', 4500, 1.2]],
    [
      [0.002, 0.45],
      [0.018, 0],
    ]
  )
  // Landing slap, then its low tail.
  voice(
    0.42,
    0.06,
    [['bandpass', 3000, 1.6, 1600]],
    [
      [0.004, 0.6],
      [0.03, 0.15],
      [0.06, 0],
    ]
  )
  voice(
    0.46,
    0.09,
    [['bandpass', 1500, 1.0, 900]],
    [
      [0.01, 0.08],
      [0.09, 0],
    ]
  )
}

export class Flipbook {
  constructor(root, { pages, pdf, aspect, title, fallback }) {
    this.fallback = fallback
    this.abort = new AbortController()
    this.root = root
    this.pages = pages // [{lo, hi, th}]
    this.n = pages.length
    this.pdf = pdf
    this.H = 297
    this.W = 297 * aspect
    this.left = -1 // left page number of the open spread (0 = closed, cover on the right)
    this.zoom = 1
    this.pan = { x: 0, y: 0 }
    this.sound = true
    this.single = false
    this.anim = null
    this.queue = [] // turns clicked while another was animating
    this.cache = new Map()
    this.loader = new ImageBitmapLoader().setOptions({ imageOrientation: 'flipY' })
    this.buildDom(title)
    this.buildScene()
    this.bindEvents()
    const start = this.pageFromHash() ?? 1 // before autoMode can rewrite the hash
    this.autoMode()
    this.go(start, false)
    this.resize()
  }

  // ---------- DOM ----------
  buildDom(title) {
    const r = this.root
    r.classList.add('fb')
    r.innerHTML = `
      <div class="fb-stage"></div>
      <button class="fb-arrow fb-prev" aria-label="Previous page">${icon('chevron-left')}</button>
      <button class="fb-arrow fb-next" aria-label="Next page">${icon('chevron-right')}</button>
      <aside class="fb-thumbs" aria-label="Thumbnails" hidden>
        <header><span>Thumbnails</span><button data-a="thumbs" aria-label="Close">${icon('x')}</button></header>
        <div class="fb-grid"></div>
      </aside>
      <nav class="fb-bar" aria-label="Flipbook controls">
        <label class="fb-page"><input inputmode="numeric" aria-label="Page number"><span></span></label>
        <button data-a="thumbs" title="Thumbnails">${icon('layout-grid')}</button>
        <button data-a="zin" title="Zoom in">${icon('zoom-in')}</button>
        <button data-a="zout" title="Zoom out">${icon('zoom-out')}</button>
        <button data-a="full" title="Full screen">${icon('maximize')}</button>
        <button data-a="share" title="Share">${icon('share-2')}</button>
        <div class="fb-more">
          <button data-a="more" title="More" aria-haspopup="menu">${icon('ellipsis')}</button>
          <div class="fb-menu" role="menu" hidden>
            <a role="menuitem" href="${this.pdf}" download target="_blank" rel="noopener">${icon('download')}<span>Download PDF file</span></a>
            <button role="menuitem" data-a="mode">${icon('file')}<span>Single page mode</span></button>
            <button role="menuitem" data-a="first">${icon('chevrons-left')}<span>Go to first page</span></button>
            <button role="menuitem" data-a="last">${icon('chevrons-right')}<span>Go to last page</span></button>
            <button role="menuitem" data-a="sound">${icon('volume-2')}<span>Turn sound off</span></button>
          </div>
        </div>
      </nav>`
    this.$ = (s) => r.querySelector(s)
    this.stage = this.$('.fb-stage')
    this.pageInput = this.$('.fb-page input')
    this.pageLabel = this.$('.fb-page span')
    r.setAttribute('aria-label', title)
    const grid = this.$('.fb-grid')
    grid.innerHTML = this.pages
      .map(
        (p, i) =>
          `<button data-p="${i + 1}"><img loading="lazy" decoding="async" src="${p.th}" data-alt="${this.fallback?.(p.th) ?? ''}" alt=""><span>${i + 1}</span></button>`
      )
      .join('')
    // If the CDN fails, show each thumbnail from the backup host instead.
    grid.addEventListener(
      'error',
      (e) => {
        const img = e.target
        if (img.tagName === 'IMG' && img.dataset.alt) {
          img.src = img.dataset.alt
          img.dataset.alt = ''
        }
      },
      true
    )
  }

  // ---------- 3D scene ----------
  buildScene() {
    const { W, H } = this
    const renderer = (this.renderer = new WebGLRenderer({ antialias: true, alpha: true }))
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = PCFSoftShadowMap
    renderer.outputColorSpace = SRGBColorSpace
    this.stage.append(renderer.domElement)
    this.maxAniso = renderer.capabilities.getMaxAnisotropy()

    const scene = (this.scene = new Scene())
    this.camera = new PerspectiveCamera(P.fov, 1, 4, 5e4)
    scene.add(new AmbientLight(0xffffff, P.ambient * Math.PI))
    const light = (this.light = new DirectionalLight(0xffffff, P.light * Math.PI))
    light.position.set(...P.lightPos)
    light.castShadow = true
    light.shadow.mapSize.set(1024, 1024)
    light.shadow.bias = -0.005
    light.shadow.radius = 2
    Object.assign(light.shadow.camera, {
      near: 200,
      far: 1200,
      left: -400,
      right: 400,
      top: 400,
      bottom: -400,
    })
    scene.add(light)

    const ground = new Mesh(
      new PlaneGeometry(4000, 4000),
      new ShadowMaterial({ opacity: P.shadowOpacity })
    )
    ground.position.z = -6
    ground.receiveShadow = true
    scene.add(ground)

    this.book = new Group()
    scene.add(this.book)

    // Every page material always has a map (a 1x1 blank until the image
    // arrives), so swapping pages never changes the shader and never makes
    // the GPU compile a new one in the middle of a turn.
    this.blank = new DataTexture(new Uint8Array([244, 244, 244, 255]), 1, 1)
    this.blank.needsUpdate = true
    const mat = () =>
      new MeshPhongMaterial({
        color: 0xffffff,
        map: this.blank,
        shininess: P.shininess,
        specular: 0x111111,
      })
    // Static pages on each side of the spine.
    // Resting pages use the same bent strip as a turning sheet, posed where
    // a turn ends, so a finished turn hands over without any jump.
    const flat = (side) => {
      const g = new PlaneGeometry(W, H, P.segments, 48)
      g.translate(W / 2, 0, 0)
      // A turning sheet starts and ends at exactly the depth of the page
      // beneath it. Pushing resting pages back in the depth test keeps the
      // turning sheet on top, so the page underneath never flickers through.
      const m = new Mesh(
        g,
        Object.assign(mat(), {
          side: side > 0 ? FrontSide : BackSide,
          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 4,
        })
      )
      m.receiveShadow = true
      m.castShadow = true
      this.book.add(m)
      return m
    }
    this.leftPage = flat(-1)
    this.rightPage = flat(1)
    this.sheetRows = 48

    // Stacks of sheets under each page, so the book has visible thickness.
    const stack = (side) => {
      const g = new BoxGeometry(W, H, 1)
      g.translate((side * W) / 2, 0, -0.5)
      const m = new Mesh(g, new MeshPhongMaterial({ color: 0xffffff, shininess: P.shininess }))
      m.castShadow = m.receiveShadow = true
      this.book.add(m)
      return m
    }
    this.leftStack = stack(-1)
    this.rightStack = stack(1)

    // Soft shade along the spine.
    const c = document.createElement('canvas')
    c.width = 256
    c.height = 1
    const cx = c.getContext('2d'),
      gr = cx.createLinearGradient(0, 0, 256, 0)
    gr.addColorStop(0, 'rgba(0,0,0,0)')
    gr.addColorStop(0.42, 'rgba(0,0,0,0.10)')
    gr.addColorStop(0.5, 'rgba(0,0,0,0.22)')
    gr.addColorStop(0.58, 'rgba(0,0,0,0.10)')
    gr.addColorStop(1, 'rgba(0,0,0,0)')
    cx.fillStyle = gr
    cx.fillRect(0, 0, 256, 1)
    const gt = new CanvasTexture(c)
    this.gutter = new Mesh(
      new PlaneGeometry(W * 0.16, H),
      new MeshBasicMaterial({ map: gt, transparent: true, depthWrite: false })
    )
    this.book.add(this.gutter)

    // Cover boards, slightly larger than the pages, behind each side.
    const board = (side) => {
      const bw = W * (1 + P.boardExtra),
        bh = H * (1 + 2 * P.boardExtra)
      const g = new BoxGeometry(bw, bh, 2)
      g.translate((side * bw) / 2, 0, -2)
      const m = new Mesh(g, new MeshPhongMaterial({ color: P.boardColor, shininess: P.shininess }))
      m.receiveShadow = true
      m.castShadow = true
      this.book.add(m)
      return m
    }
    this.leftBoard = board(-1)
    this.rightBoard = board(1)

    // The turning sheet: one finely divided strip, bent on the CPU each frame.
    this.sheetRows = 48
    const g = (this.sheetGeo = new PlaneGeometry(W, H, P.segments, this.sheetRows))
    g.translate(W / 2, 0, 0)
    this.front = new Mesh(g, Object.assign(mat(), { side: FrontSide }))
    this.back = new Mesh(g, Object.assign(mat(), { side: BackSide }))
    for (const m of [this.front, this.back]) {
      m.castShadow = m.receiveShadow = true
      m.visible = false
      this.book.add(m)
    }
    this.dirty = true
    const loop = (t) => {
      if (this.dead) return
      requestAnimationFrame(loop)
      if (this.anim) this.step(t)
      if (this.dirty) {
        this.dirty = false
        this.renderer.render(this.scene, this.camera)
      }
    }
    requestAnimationFrame(loop)
  }

  // Bend the sheet as one cubic curve from its free edge to the spine.
  // a: sheet angle, r: curve angle (radians, 0 = lying right, PI = left);
  // turned: degrees turned from the starting side (for the mid-turn shrink).
  bend(a, r, turned, curl, side = 1, geo = this.sheetGeo, baseZ) {
    const pos = geo.attributes.position
    const segs = P.segments,
      W = this.W
    const f = P.flex
    const reach = 1 - Math.sin((f / 2) * (f / 2)) / 2 - f / 20
    const s0 = turned < P.shrinkPeak ? turned / P.shrinkPeak : (180 - turned) / (180 - P.shrinkPeak)
    const sc = Math.max(0, Math.min(1, s0))
    const shrink = 1 - (P.shrinkPct / 100) * sc * sc * (3 - 2 * sc)
    const p = W * reach * shrink,
      d = p * f * Math.sin(a) // flat at rest, so a finished turn lies exactly on the stack
    const u = Math.cos(a),
      c = Math.sin(a),
      k = Math.PI / 4 + a / 2
    // Control points, free edge first; x is positive to the right of the spine.
    const P0 = [p * u, c * p],
      P1 = [(p / 2) * Math.cos(r), (p / 2) * Math.sin(r)]
    const P2 = [(Math.cos(k) * d) / 2, Math.sin(k) * d],
      P3 = [0, 0]
    // Sample finely, then place vertices at equal arc length from the spine
    // so the printed page never stretches, scaled to the page's true width.
    const N = 600,
      xs = new Float32Array(N + 1),
      zs = new Float32Array(N + 1),
      len = new Float32Array(N + 1)
    for (let i = 0; i <= N; i++) {
      const t = 1 - i / N,
        v = 1 - t
      const b0 = v * v * v,
        b1 = 3 * v * v * t,
        b2 = 3 * v * t * t,
        b3 = t * t * t
      xs[i] = b0 * P0[0] + b1 * P1[0] + b2 * P2[0] + b3 * P3[0]
      zs[i] = b0 * P0[1] + b1 * P1[1] + b2 * P2[1] + b3 * P3[1]
      if (i) len[i] = len[i - 1] + Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1])
    }
    const total = len[N] || 1,
      scale = W / p // free edge sits at the page edge when flat
    const [rz, lz] = this.sheetBase ?? [0, 0]
    const base = baseZ ?? rz + ((lz - rz) * (1 - Math.cos(a))) / 2 + 0.3
    // Curve position and normal at an arc length from the spine.
    const at = (len0) => {
      const want = Math.max(0, Math.min(total, (len0 / W) * total))
      let lo = 0,
        hi = N
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1
        if (len[mid] < want) lo = mid
        else hi = mid
      }
      const q = (want - len[lo]) / (len[hi] - len[lo] || 1)
      const tx = xs[hi] - xs[lo],
        tz = zs[hi] - zs[lo],
        tl = Math.hypot(tx, tz) || 1
      return [(xs[lo] + tx * q) * scale, (zs[lo] + tz * q) * scale, -tz / tl, tx / tl]
    }
    const rows = this.sheetRows,
      cols = segs + 1,
      H = this.H
    const fade = curl ? Math.min(curl.R * 0.15, W * 0.05) : 0
    for (let yi = 0; yi <= rows; yi++) {
      const Y = H / 2 - (yi / rows) * H
      for (let i = 0; i <= segs; i++) {
        let X = (i / segs) * W,
          Yc = Y,
          Zc = 0
        if (curl && X > W * 0.04) {
          const ox = X - curl.px,
            oy = Y - curl.py
          const sAlong = ox * curl.dx + oy * curl.dy
          if (sAlong > -fade) {
            const perp = -ox * curl.dy + oy * curl.dx
            const th = sAlong / curl.R
            const nx = curl.px - curl.dy * perp + curl.dx * curl.R * Math.sin(th)
            const ny = curl.py + curl.dx * perp + curl.dy * curl.R * Math.sin(th)
            const nz = curl.R * (1 - Math.cos(th))
            const w = smoothstepR(-fade, fade, sAlong)
            X += (nx - X) * w
            Yc += (ny - Yc) * w
            Zc = nz * w
          }
        }
        const [cx0, cz0, nx0, nz0] = at(X)
        const k = yi * cols + i
        pos.setXYZ(k, cx0 + nx0 * Zc * side, Yc, cz0 + nz0 * Zc * side + base)
      }
    }
    pos.needsUpdate = true
    geo.computeVertexNormals()
    geo.computeBoundingSphere()
  }

  // ---------- textures ----------
  tex(n, hi = false) {
    if (n < 1 || n > this.n) return null
    const key = n + (hi ? 'h' : 'l')
    let e = this.cache.get(key)
    if (!e) {
      const t = new Texture()
      t.flipY = false
      t.colorSpace = SRGBColorSpace
      t.anisotropy = this.maxAniso
      e = { t, ready: false }
      this.cache.set(key, e)
      const url = hi ? this.pages[n - 1].hi : this.pages[n - 1].lo
      const done = (bmp) => {
        t.image = bmp
        t.needsUpdate = true
        e.ready = true
        // Upload to the GPU now, not on the first frame of a turn.
        this.renderer.initTexture(t)
        this.refresh()
      }
      // If the CDN fails, try the backup host once.
      this.loader.load(url, done, undefined, () => {
        const alt = this.fallback?.(url)
        if (alt) this.loader.load(alt, done)
      })
    }
    e.used = performance.now()
    if (hi && !e.ready) return this.tex(n) // show the small one until the sharp one arrives
    return e.t
  }
  bestTex(n) {
    if (this.zoom > 1) {
      const h = this.cache.get(n + 'h')
      if (h?.ready) return h.t
      this.tex(n, true)
    }
    return this.tex(n)
  }
  mirrored(n) {
    const src = this.bestTex(n)
    if (!src) return null
    const key = n + 'm' + (src === this.cache.get(n + 'h')?.t ? 'h' : 'l')
    let e = this.cache.get(key)
    if (!e || e.src !== src || e.t.image !== src.image) {
      // Same image and sampling settings as the source, so the GPU reuses its
      // upload; only the UV transform (a uniform) mirrors it.
      const t = src.clone()
      t.repeat.x = -1
      t.offset.x = 1
      t.needsUpdate = !!src.image
      if (src.image) this.renderer.initTexture(t)
      e = { t, src, ready: true }
      this.cache.set(key, e)
    }
    e.used = performance.now()
    return e.t
  }
  setMap(mesh, t) {
    // A texture whose image has not arrived shows the blank instead of a
    // stale or black frame.
    mesh.material.map = t?.image ? t : this.blank
  }
  prefetch() {
    for (let d = -4; d <= 6; d++) this.tex(this.left + d)
    // Drop textures far from the current spread to keep GPU memory small.
    if (this.cache.size > 40) {
      const keep = new Set()
      for (let d = -6; d <= 8; d++) keep.add(this.left + d)
      for (const [k, e] of this.cache) {
        if (!keep.has(parseInt(k))) {
          e.t.dispose()
          e.t.image?.close?.()
          this.cache.delete(k)
        }
      }
    }
  }

  // ---------- layout ----------
  spreadOf(p) {
    if (this.single) return p
    return p - (p % 2) // left page number; cover (1) -> 0
  }
  refresh() {
    const L = this.left,
      a = this.anim
    const show = (mesh, n) => {
      mesh.visible = n >= 1 && n <= this.n
      if (mesh.visible)
        this.setMap(mesh, mesh === this.leftPage ? this.mirrored(n) : this.bestTex(n))
    }
    if (this.single) {
      show(this.leftPage, a && a.dir < 0 ? 0 : 0)
      show(this.rightPage, a ? (a.dir > 0 ? L + 1 : L) : L)
    } else {
      show(this.leftPage, a ? (a.dir > 0 ? L : L - 2) : L)
      show(this.rightPage, a ? (a.dir > 0 ? L + 3 : L + 1) : L + 1)
    }
    if (a) {
      this.front.visible = this.back.visible = true
      this.setMap(this.front, this.bestTex(a.front))
      this.setMap(this.back, this.mirrored(a.back))
      this.back.visible = a.back >= 1 && a.back <= this.n
    } else {
      this.front.visible = this.back.visible = false
    }
    const open = !this.single && this.leftPage.visible && this.rightPage.visible
    this.leftBoard.visible = (open || !!a) && !this.single && this.leftPage.visible
    this.rightBoard.visible = (open || !!a) && !this.single && this.rightPage.visible
    this.gutter.visible = open
    this.layoutStacks(a ? (a.dir > 0 ? L : L - 2) : L)
    this.dirty = true
  }
  // Thickness of the sheets lying on each side; pages rest on top.
  layoutStacks(L) {
    const t = 0.2,
      lz = (Math.max(0, L) / 2) * t + 0.01,
      rz = (Math.max(0, this.n - L - (this.anim ? 2 : 0)) / 2) * t + 0.01
    this.leftStack.scale.z = lz
    this.rightStack.scale.z = rz
    this.leftStack.visible = !this.single && this.leftPage.visible
    this.rightStack.visible = this.rightPage.visible
    this.leftPage.position.z = (this.leftStack.visible ? lz : 0) + 0.3
    this.rightPage.position.z = rz + 0.3
    if (!this._restBent) {
      this._restBent = true
      this.bend(0, 0, 0, null, 1, this.rightPage.geometry, 0)
      this.bend(Math.PI, Math.PI, 0, null, -1, this.leftPage.geometry, 0)
    }
    this.gutter.position.z = Math.max(lz, rz) + 0.05
    this.sheetBase = [rz, lz]
  }
  // Horizontal shift that centres a closed book on its one visible page.
  offsetFor(L) {
    if (this.single) return -this.W / 2
    if (L <= 0) return -this.W / 2
    if (L >= this.n) return this.W / 2
    return 0
  }
  resize() {
    const w = this.stage.clientWidth,
      h = this.stage.clientHeight
    if (!w || !h) return
    this.renderer.setSize(w, h)
    this.camera.aspect = w / h
    const bookW = (this.single ? 1 : 2) * this.W,
      bookH = this.H
    const pad = P.padding * 2
    const vh = Math.max(50, h - pad - 40),
      vw = Math.max(50, w - pad - 140)
    // Distance at which the book exactly fits, from the camera's field of view.
    const tan = Math.tan(MathUtils.degToRad(P.fov / 2))
    const fitH = (bookH / (2 * tan)) * (h / vh)
    const fitW = (bookW / (2 * tan * this.camera.aspect)) * (w / vw)
    this.baseDist = Math.max(fitH, fitW)
    this.applyCamera()
  }
  applyCamera() {
    const d = this.baseDist / this.zoom
    const tan = Math.tan(MathUtils.degToRad(P.fov / 2))
    const h = this.stage.clientHeight || 1
    // Lift the book a little so the toolbar sits under it, as on the old site.
    const up = (20 / h) * 2 * this.baseDist * tan
    this.camera.position.set(this.pan.x, this.pan.y - up / this.zoom, d)
    this.camera.lookAt(this.pan.x, this.pan.y - up / this.zoom, 0)
    this.camera.updateProjectionMatrix()
    const ld = Math.hypot(...P.lightPos)
    this.light.position
      .set(P.lightPos[0], P.lightPos[1], P.lightPos[2])
      .multiplyScalar(Math.max(1, d / ld))
    this.light.shadow.camera.far = this.light.position.length() * 2
    this.light.shadow.camera.updateProjectionMatrix()
    this.dirty = true
  }

  // ---------- navigation ----------
  go(p, animate = true) {
    p = Math.max(1, Math.min(this.n, p | 0))
    const target = this.spreadOf(p)
    if (target === this.left && !this.anim) return
    if (animate && !this.anim && Math.abs(target - this.left) <= (this.single ? 1 : 2)) {
      return this.flip(target > this.left ? 1 : -1)
    }
    // A jump cancels any turn in progress, including its single-page fade.
    this.anim = null
    this.queue.length = 0
    this.front.material.opacity = 1
    this.left = target
    this.book.position.x = this.offsetFor(target)
    this.after()
  }
  next() {
    this.flip(1)
  }
  prev() {
    this.flip(-1)
  }
  // Start a turn. The page is driven by a virtual cursor (cx, cy) in page
  // units: cx 1 = outer edge, -1 = fully over; cy 1 = corner row, 0 = middle.
  flip(dir, cursor) {
    // A click during a turn queues the next turn instead of cutting this one
    // short, so fast clicking still animates every page. A click the other
    // way replaces the queue, and at most a few turns wait.
    if (this.anim) {
      if (cursor) return
      const q = this.queue
      if (q.length && q[q.length - 1] !== dir) q.length = 0
      if (q.length < 3) q.push(dir)
      return
    }
    const step = this.single ? 1 : 2
    const L = this.left
    if (dir > 0 && !this.hasNext()) return
    if (dir < 0 && L - step < (this.single ? 1 : 0)) return
    const front = this.single ? (dir > 0 ? L : L - 1) : dir > 0 ? L + 1 : L - 1
    const back = this.single ? 0 : dir > 0 ? L + 2 : L
    const start = cursor ?? { cx: 0.9, cy: 0.95, above: false }
    this.anim = {
      dir,
      front,
      back,
      hard: !this.single && (front === 1 || back === this.n || front === this.n),
      cur: { ...start },
      from: { ...start },
      to: { cx: -1, cy: 0 },
      t0: performance.now(),
      dur: P.duration,
      drag: !!cursor,
      x0: this.book.position.x,
      x1: this.offsetFor(L + dir * step),
      target: L + dir * step,
    }
    if (!cursor) this.playSound()
    this.refresh()
    this.drawAt()
    if (!cursor && reducedMotion()) this.finishNow()
  }
  // Curve angle (degrees turned) for a cursor position.
  curveFor(cx) {
    cx = Math.max(-1, Math.min(1, cx))
    if (cx >= 0.25) return 0
    if (cx >= 0) return ((0.25 - cx) / 0.25) * 35
    if (cx >= -0.5) return 35 + (-cx / 0.5) * 25
    return 60 + ((-cx - 0.5) / 0.5) * 120
  }
  step(now) {
    const A = this.anim
    if (A.drag) return
    const t = Math.min(1, Math.max(0, (now - A.t0) / A.dur))
    const e = easeInOutQuad(t)
    A.cur.cx = A.from.cx + (A.to.cx - A.from.cx) * e
    A.cur.cy = A.from.cy + (A.to.cy - A.from.cy) * e
    this.drawAt()
    if (t >= 1) this.complete()
  }
  drawAt() {
    const A = this.anim
    const { cx } = A.cur
    const T = A.hard ? 180 * Math.max(0, Math.min(1, (1 - cx) / 2)) : 180 * turnShare(cx)
    const C = A.hard ? T : this.curveFor(cx)
    const fwd = A.dir > 0
    const rad = Math.PI / 180
    const a = (fwd ? T : 180 - T) * rad,
      r = (fwd ? C : 180 - C) * rad
    this.bend(a, r, T, A.hard ? null : this.curlFor(A.cur), fwd ? 1 : -1)
    const k = T / 180
    this.book.position.x = A.x0 + (A.x1 - A.x0) * k
    if (this.single) {
      const o = 1 - Math.max(0, Math.min(1, (k - 0.5) * 2))
      this.front.material.transparent = true
      this.front.material.opacity = o
    }
    this.dirty = true
  }
  // The corner fold for a cursor: a fold line through `pivot` with the corner
  // side wrapped round a cylinder by up to 150 degrees, relaxing as it turns.
  curlFor({ cx, cy, above }) {
    const W = this.W,
      hc = (above ? 1 : -1) * (this.H / 2)
    const n = W
    cy = Math.max(0, Math.min(1, cy))
    const u = cy < CURL_ROWS.cyFor(cx) ? Math.min(cx, CURL_ROWS.cxFor(cy)) : cx
    const relax = 1 - smooth(turnShare(cx))
    let fx = u * n,
      fy = hc + (cy * hc - hc) * relax
    const wrap = ((150 * Math.PI) / 180) * relax
    if (wrap > 0.001) {
      const e = Math.sin(wrap) / wrap,
        k = Math.min((1.75 * e) / Math.max(1 - e, 0.001), 1.5)
      fx += (fx - n) * k
      fy += (fy - hc) * k
    }
    const S = 0.75 * n,
      P7 = 0.7 * S
    let dx = n - fx,
      dy = hc - fy,
      dist = Math.hypot(dx, dy)
    if (dist > P7) {
      const m = (S - (S - P7) * Math.exp(-(dist - P7) / (S - P7))) / dist
      fx = n - dx * m
      fy = hc - dy * m
      dx = n - fx
      dy = hc - fy
      dist = Math.hypot(dx, dy)
    }
    if (wrap < 0.001 || dist < 0.001) return null
    return { px: fx, py: fy, dx: dx / dist, dy: dy / dist, R: dist / wrap }
  }
  complete() {
    const A = this.anim
    this.anim = null
    this.front.material.opacity = 1
    if (!A.cancel) this.left = A.target
    this.book.position.x = this.offsetFor(this.left)
    this.after()
    const next = this.queue.shift()
    if (next) this.flip(next)
  }
  finishNow() {
    const A = this.anim
    A.drag = false
    A.t0 = -1e9
    this.step(performance.now())
  }
  after() {
    this.refresh()
    this.prefetch()
    const L = this.left
    const shown = this.single ? L : L + 1 <= this.n ? L + 1 : L
    this.pageLabel.textContent = `${shown}/${this.n}`
    this.$('.fb-prev').hidden = this.single ? L <= 1 : L <= 0
    this.$('.fb-next').hidden = !this.hasNext()
    history.replaceState(null, '', `#page=${shown}`)
  }
  // Whether a later page or spread exists. In double mode the last spread is
  // spreadOf(n): for an odd count it holds the final page on the right.
  hasNext() {
    return this.single ? this.left + 1 <= this.n : this.left + 2 <= this.spreadOf(this.n)
  }
  pageFromHash() {
    const m = location.hash.match(/page=(\d+)/)
    return m ? +m[1] : null
  }

  // ---------- sound ----------
  playSound() {
    if (!this.sound) return
    try {
      const ac = (this.ac ??= new AudioContext())
      paperTurn(ac, ac.destination, ac.currentTime)
    } catch {}
  }

  destroy() {
    this.dead = true
    this.abort.abort()
    this.ro?.disconnect()
    for (const e of this.cache.values()) {
      e.t.dispose()
      e.t.image?.close?.()
    }
    this.renderer.dispose()
    this.ac?.close?.()
  }

  // ---------- input ----------
  bindEvents() {
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(this.root)
    this.$('.fb-prev').onclick = () => this.prev()
    this.$('.fb-next').onclick = () => this.next()
    addEventListener(
      'keydown',
      (e) => {
        if (e.target.closest?.('input, textarea, select, [contenteditable]')) return
        if (e.key === 'ArrowRight') this.next()
        if (e.key === 'ArrowLeft') this.prev()
        if (e.key === 'Escape') this.closeMenus()
      },
      { signal: this.abort.signal }
    )
    this.root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a],[data-p]')
      if (!b) return
      if (b.dataset.p) {
        this.go(+b.dataset.p, false)
        if (innerWidth < 700) this.toggleThumbs(false)
        return
      }
      const a = b.dataset.a
      if (a !== 'more') this.closeMenus()
      if (a === 'thumbs') this.toggleThumbs()
      if (a === 'zin') this.setZoom(this.zoom * P.zoomRatio)
      if (a === 'zout') this.setZoom(this.zoom / P.zoomRatio)
      if (a === 'full') this.toggleFull()
      if (a === 'share') this.share()
      if (a === 'more') {
        const m = this.$('.fb-menu')
        m.hidden = !m.hidden
      }
      if (a === 'first') this.go(1, false)
      if (a === 'last') this.go(this.n, false)
      if (a === 'mode') {
        this.userMode = true
        this.setSingle(!this.single)
      }
      if (a === 'sound') {
        this.sound = !this.sound
        b.innerHTML = `${icon(this.sound ? 'volume-2' : 'volume-x')}<span>Turn sound ${this.sound ? 'off' : 'on'}</span>`
      }
    })
    document.addEventListener(
      'click',
      (e) => {
        if (!e.target.closest('.fb-more')) this.closeMenus()
      },
      { signal: this.abort.signal }
    )
    const inp = this.pageInput
    this.$('.fb-page').onclick = () => inp.focus()
    inp.onfocus = () => {
      inp.value = ''
      this.root.classList.add('fb-typing')
    }
    inp.onblur = () => this.root.classList.remove('fb-typing')
    inp.onkeydown = (e) => {
      if (e.key === 'Enter') {
        this.go(+inp.value, false)
        inp.blur()
      }
    }
    document.addEventListener(
      'fullscreenchange',
      () => {
        this.$('[data-a=full]').innerHTML = icon(
          document.fullscreenElement ? 'minimize' : 'maximize'
        )
      },
      { signal: this.abort.signal }
    )
    addEventListener('resize', () => this.autoMode(), { signal: this.abort.signal })

    // Pointer: drag a page to turn it, click to turn, drag to pan when zoomed.
    const cv = this.renderer.domElement
    let down = null
    cv.addEventListener('pointerdown', (e) => {
      const b = this.toBook(e)
      down = { x: e.clientX, y: e.clientY, b, moved: false, pan: { ...this.pan } }
      cv.setPointerCapture(e.pointerId)
    })
    cv.addEventListener('pointermove', (e) => {
      if (!down) {
        const b = this.toBook(e)
        cv.style.cursor = this.zoom > 1 ? 'grab' : this.onPage(b) ? 'pointer' : 'default'
        return
      }
      const dx = e.clientX - down.x,
        dy = e.clientY - down.y
      if (!down.moved && Math.hypot(dx, dy) < 6) return
      down.moved = true
      if (this.zoom > 1) {
        const k =
          (((2 * this.baseDist) / this.zoom) * Math.tan(MathUtils.degToRad(P.fov / 2))) /
          this.stage.clientHeight
        this.pan.x = down.pan.x - dx * k
        this.pan.y = down.pan.y + dy * k
        this.applyCamera()
        return
      }
      this.dragTo(down, this.toBook(e))
    })
    const up = (e) => {
      if (!down) return
      const d = down
      down = null
      if (this.zoom > 1 && d.moved) return
      if (!d.moved) {
        if (this.zoom > 1) return
        const side = this.sideOf(d.b)
        if (side > 0) this.next()
        else if (side < 0) this.prev()
        return
      }
      this.release(this.toBook(e))
    }
    cv.addEventListener('pointerup', up)
    cv.addEventListener('pointercancel', up)
    cv.addEventListener('dblclick', () => this.setZoom(this.zoom > 1 ? 1 : P.zoomRatio))
  }
  toBook(e) {
    const r = this.renderer.domElement.getBoundingClientRect()
    const v = new Vector3(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1,
      0.5
    )
    v.unproject(this.camera)
    const dir = v.sub(this.camera.position).normalize()
    const t = -this.camera.position.z / dir.z
    const p = this.camera.position.clone().add(dir.multiplyScalar(t))
    return { x: p.x - this.book.position.x, y: p.y }
  }
  onPage(b) {
    if (Math.abs(b.y) > this.H / 2) return false
    return (
      (b.x > 0 && b.x < this.W && this.rightPage.visible) ||
      (b.x < 0 && b.x > -this.W && this.leftPage.visible && !this.single)
    )
  }
  sideOf(b) {
    if (!this.onPage(b)) return 0
    if (this.single) return b.x > this.W / 2 ? 1 : -1
    return b.x > 0 ? 1 : -1
  }
  // Pointer position as a cursor on the sheet being turned.
  cursorAt(b, dir) {
    const cx = (dir > 0 ? b.x : -b.x) / this.W
    return {
      cx: Math.max(-1, Math.min(1, cx)),
      cy: Math.min(1, Math.abs(b.y) / (this.H / 2)),
      above: b.y > 0,
    }
  }
  dragTo(down, b) {
    if (this.single) return
    if (!this.anim) {
      const side = this.sideOf(down.b)
      if (!side) return
      this.flip(side, this.cursorAt(down.b, side))
      if (!this.anim) return
    }
    const A = this.anim
    if (!A.drag) return
    const c = this.cursorAt(b, A.dir)
    A.cur.cx = c.cx
    A.cur.cy = c.cy
    this.drawAt()
  }
  release() {
    const A = this.anim
    if (!A || !A.drag) return
    A.drag = false
    const done = turnShare(A.cur.cx) > 0.5 || A.cur.cx < 0
    A.from = { ...A.cur }
    A.to = done ? { cx: -1, cy: 0 } : { cx: 1, cy: A.cur.cy }
    A.dur = Math.max(150, (P.duration * Math.abs(A.to.cx - A.from.cx)) / 2)
    A.cancel = !done
    A.t0 = performance.now()
    if (done) this.playSound()
    if (reducedMotion()) this.finishNow()
  }

  setZoom(z) {
    this.zoom = Math.max(1, Math.min(P.maxZoom, z))
    if (this.zoom === 1) this.pan = { x: 0, y: 0 }
    this.root.classList.toggle('fb-zoomed', this.zoom > 1)
    this.$('[data-a=zout]').disabled = this.zoom === 1
    this.$('[data-a=zin]').disabled = this.zoom >= P.maxZoom
    this.applyCamera()
    this.refresh()
  }
  setSingle(on) {
    const page = this.single ? this.left : Math.max(1, this.left)
    this.single = on
    this.root.classList.toggle('fb-single', on)
    const b = this.$('[data-a=mode]')
    b.innerHTML = `${icon(on ? 'book-open' : 'file')}<span>${on ? 'Double' : 'Single'} page mode</span>`
    this.left = -1
    this.go(page, false)
    this.resize()
  }
  autoMode() {
    const want = this.root.clientWidth < this.root.clientHeight * 0.9
    if (want !== this.single && !this.userMode) this.setSingle(want)
  }
  toggleThumbs(force) {
    const t = this.$('.fb-thumbs')
    const hide = force === undefined ? !t.hidden : !force
    if (hide && t.contains(document.activeElement)) this.$('.fb-bar [data-a=thumbs]').focus()
    t.hidden = hide
    if (!t.hidden)
      t.querySelector(`[data-p="${Math.max(1, this.left)}"]`)?.scrollIntoView({ block: 'center' })
  }
  closeMenus() {
    const m = this.$('.fb-menu')
    if (!m.hidden && m.contains(document.activeElement)) this.$('[data-a=more]').focus()
    m.hidden = true
  }
  toggleFull() {
    if (document.fullscreenElement) document.exitFullscreen()
    else (this.root.requestFullscreen ?? this.root.webkitRequestFullscreen)?.call(this.root)
  }
  async share() {
    const url = location.href
    try {
      if (navigator.share) await navigator.share({ title: document.title, url })
      else {
        await navigator.clipboard.writeText(url)
        this.toast('Link copied')
      }
    } catch {}
  }
  toast(msg) {
    const t = document.createElement('div')
    t.className = 'fb-toast'
    t.textContent = msg
    this.root.append(t)
    setTimeout(() => t.remove(), 1800)
  }
}
