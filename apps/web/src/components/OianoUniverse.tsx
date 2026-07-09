import { useEffect, useRef } from 'react';

// ── OIANO Universe Canvas ─────────────────────────────────────────────────────
// Cinematic globe + particle system + star field
// Full requestAnimationFrame loop, GPU-accelerated via canvas compositing
// `intensified` (e.g. an input has focus) spawns particles faster/brighter —
// used by EnterPage as the "system is listening" cue described in the wireframe.
// ─────────────────────────────────────────────────────────────────────────────
export default function OianoUniverse({ intensified = false }: { intensified?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const intensifiedRef = useRef(intensified);
  intensifiedRef.current = intensified;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Non-null aliases so TypeScript doesn't complain inside nested closures
    const cv  = canvas as HTMLCanvasElement;
    const gctx = ctx   as CanvasRenderingContext2D;

    let animId: number;
    const t0 = performance.now();

    // ── resize → resets canvas context transform ──────────────────────────
    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width  = cv.offsetWidth  * dpr;
      cv.height = cv.offsetHeight * dpr;
      gctx.scale(dpr, dpr);
    }
    window.addEventListener('resize', resize);
    resize();

    // ── Stars — generated once ────────────────────────────────────────────
    const STARS = Array.from({ length: 700 }, () => ({
      x:  Math.random(),
      y:  Math.random() * 0.73,
      r:  0.15 + Math.random() * 1.05,
      op: 0.06 + Math.random() * 0.52,
      ts: 0.15 + Math.random() * 1.6,
      tp: Math.random() * Math.PI * 2,
    }));

    // ── Dust cloud descriptors ────────────────────────────────────────────
    const DUST = [
      { nx: 0.17, ny: 0.11, rw: 0.30, op: 0.020 },
      { nx: 0.70, ny: 0.20, rw: 0.24, op: 0.016 },
      { nx: 0.44, ny: 0.05, rw: 0.36, op: 0.014 },
      { nx: 0.85, ny: 0.38, rw: 0.18, op: 0.012 },
    ];

    // ── City lights on globe surface ──────────────────────────────────────
    const CITIES = Array.from({ length: 220 }, () => ({
      theta: Math.random() * Math.PI * 2,
      phi:   (Math.random() * 0.55 - 0.08) * Math.PI,
      br:    0.12 + Math.random() * 0.88,
      sz:    0.4  + Math.random() * 2.8,
    }));

    // ── Particle pool ─────────────────────────────────────────────────────
    interface P {
      x: number; y: number;
      vx: number; vy: number;
      sz: number; life: number;
      spd: number; maxOp: number;
    }
    const particles: P[] = [];

    function spawnParticle(w: number, h: number, cx: number, cy: number, R: number, boost: number) {
      const angle = (Math.random() - 0.5) * Math.PI * 0.88;
      const r     = R * (0.95 + Math.random() * 0.07);
      const px    = cx + Math.sin(angle) * r;
      const py    = cy - Math.cos(angle) * r;
      if (px < 0 || px > w || py < 0 || py > h) return;
      particles.push({
        x: px, y: py,
        vx: (Math.random() - 0.5) * 0.10,
        vy: -(0.04 + Math.random() * 0.16) * boost,
        sz:     0.25 + Math.random() * 1.55,
        life:   0,
        spd:    (0.0012 + Math.random() * 0.0035) * boost,
        maxOp:  0.10   + Math.random() * 0.72,
      });
    }

    // ── Main draw loop ────────────────────────────────────────────────────
    function draw(now: number) {
      const t  = (now - t0) / 1000;           // seconds since start
      const w  = cv.offsetWidth;
      const h  = cv.offsetHeight;

      // Guard against a zero-size canvas — happens transiently when this
      // component is unmounting (e.g. navigating away right after login)
      // and the canvas briefly has no layout box. Without this, gR below
      // divides by zero, producing NaN alpha values that crash addColorStop.
      if (w === 0 || h === 0) {
        animId = requestAnimationFrame(draw);
        return;
      }

      // Globe geometry — center sits below visible canvas
      const gcx = w * 0.5;
      const gcy = h * 1.18;          // lower center = more horizon visible
      const gR  = Math.max(w * 0.80, h * 0.92);  // larger = fills width edge to edge

      gctx.clearRect(0, 0, w, h);

      // ── Sky gradient ──────────────────────────────────────────────────
      const sky = gctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0,    'rgb(1,1,2)');
      sky.addColorStop(0.40, 'rgb(3,2,1)');
      sky.addColorStop(0.70, 'rgb(10,5,1)');
      sky.addColorStop(0.88, 'rgb(18,8,1)');
      sky.addColorStop(1.00, 'rgb(4,2,0)');
      gctx.fillStyle = sky;
      gctx.fillRect(0, 0, w, h);

      // ── Warm horizon ambient (behind globe) ───────────────────────────
      const hy   = gcy - gR;
      const hamb = gctx.createRadialGradient(gcx, hy, 0, gcx, hy, w * 0.6);
      hamb.addColorStop(0,   'rgba(160,85,8,0.05)');
      hamb.addColorStop(0.5, 'rgba(120,55,3,0.022)');
      hamb.addColorStop(1,   'rgba(0,0,0,0)');
      gctx.fillStyle = hamb;
      gctx.fillRect(0, 0, w, h);

      // ── Stars ─────────────────────────────────────────────────────────
      for (const s of STARS) {
        const tw  = Math.sin(t * s.ts + s.tp);
        const op  = Math.max(0, s.op * (0.62 + 0.38 * tw));
        const wm  = 0.5 + 0.5 * s.op;
        gctx.beginPath();
        gctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
        gctx.fillStyle = `rgba(${Math.floor(220+35*wm)},${Math.floor(195+20*wm)},${Math.floor(130+40*wm)},${op.toFixed(3)})`;
        gctx.fill();
      }

      // ── Dust clouds ───────────────────────────────────────────────────
      for (const d of DUST) {
        const drift = Math.sin(t * 0.007 + d.nx * 4) * 0.012 * w;
        const dc = gctx.createRadialGradient(
          d.nx * w + drift, d.ny * h, 0,
          d.nx * w + drift, d.ny * h, d.rw * w,
        );
        dc.addColorStop(0,   `rgba(201,168,76,${d.op})`);
        dc.addColorStop(0.55,`rgba(201,168,76,${(d.op * 0.28).toFixed(4)})`);
        dc.addColorStop(1,   'rgba(0,0,0,0)');
        gctx.fillStyle = dc;
        gctx.fillRect(0, 0, w, h);
      }

      // ── Globe surface ─────────────────────────────────────────────────
      gctx.save();
      gctx.beginPath();
      gctx.arc(gcx, gcy, gR, 0, Math.PI * 2);
      gctx.clip();

      // Dark base
      const gb = gctx.createRadialGradient(
        gcx - gR * 0.12, gcy - gR * 0.28, 0,
        gcx, gcy, gR,
      );
      gb.addColorStop(0,   'rgba(20,11,3,1)');
      gb.addColorStop(0.35,'rgba(11,5,1,1)');
      gb.addColorStop(0.75,'rgba(5,2,0,1)');
      gb.addColorStop(1,   'rgba(2,1,0,1)');
      gctx.fillStyle = gb;
      gctx.fillRect(gcx - gR, gcy - gR, gR * 2, gR * 2);

      // City lights — rotate every 5 minutes
      const rotSpd = (Math.PI * 2) / (5 * 60);
      const rotOff = t * rotSpd;

      for (const c of CITIES) {
        const theta = c.theta + rotOff;
        const cosT  = Math.cos(theta);
        if (cosT < 0) continue;            // behind globe

        const sinT   = Math.sin(theta);
        const cosPhi = Math.cos(c.phi);
        const sinPhi = Math.sin(c.phi);

        const lx = gcx + sinT * cosPhi * gR;
        const ly = gcy - sinPhi * gR;

        // Only upper portion of globe (near horizon)
        const topRatio = (gcy - ly) / gR;
        if (topRatio < 0.015 || topRatio > 0.42) continue;

        const limb  = Math.max(0, cosT);
        const dfade = Math.min(1, topRatio * 5);
        const br    = c.br * limb * dfade;
        if (br < 0.04) continue;

        const gr = gctx.createRadialGradient(lx, ly, 0, lx, ly, c.sz * 5.5);
        gr.addColorStop(0,   `rgba(255,218,110,${(br * 0.92).toFixed(3)})`);
        gr.addColorStop(0.35,`rgba(220,155,55,${(br * 0.38).toFixed(3)})`);
        gr.addColorStop(1,   'rgba(0,0,0,0)');
        gctx.fillStyle = gr;
        gctx.beginPath();
        gctx.arc(lx, ly, c.sz * 5.5, 0, Math.PI * 2);
        gctx.fill();
      }

      gctx.restore();

      // ── Horizon glow ──────────────────────────────────────────────────
      // Gentle 17.5 s pulse, ±3%
      const pulse = 1 + Math.sin((t * Math.PI * 2) / 17.5) * 0.030;

      // ── HORIZON: 4-layer build-up for photographic depth ────────────────
      // Layer 1 — deep atmospheric warmth bleeding upward
      const atm = gctx.createRadialGradient(gcx, gcy, gR * 0.70, gcx, gcy, gR * 1.45);
      atm.addColorStop(0,    'rgba(0,0,0,0)');
      atm.addColorStop(0.80, `rgba(120,55,5,${(0.06 * pulse).toFixed(3)})`);
      atm.addColorStop(0.92, `rgba(200,100,15,${(0.18 * pulse).toFixed(3)})`);
      atm.addColorStop(0.97, `rgba(240,160,40,${(0.08 * pulse).toFixed(3)})`);
      atm.addColorStop(1,    'rgba(0,0,0,0)');
      gctx.beginPath();
      gctx.arc(gcx, gcy, gR * 1.45, 0, Math.PI * 2);
      gctx.fillStyle = atm;
      gctx.fill();

      // Layer 2 — tight arc glow (the "edge of Earth" brightness)
      const ig = gctx.createRadialGradient(gcx, gcy, gR * 0.89, gcx, gcy, gR * 1.012);
      ig.addColorStop(0,     'rgba(0,0,0,0)');
      ig.addColorStop(0.82,  `rgba(255,185,55,${(0.0).toFixed(3)})`);
      ig.addColorStop(0.90,  `rgba(255,205,75,${(0.85 * pulse).toFixed(3)})`);
      ig.addColorStop(0.945, `rgba(255,242,165,${(1.00 * pulse).toFixed(3)})`);
      ig.addColorStop(0.972, `rgba(255,255,210,${(0.95 * pulse).toFixed(3)})`);
      ig.addColorStop(1.000, `rgba(255,210,80,${(0.28 * pulse).toFixed(3)})`);
      gctx.beginPath();
      gctx.arc(gcx, gcy, gR * 1.012, 0, Math.PI * 2);
      gctx.fillStyle = ig;
      gctx.fill();

      // Layer 3 — outer halo (atmosphere scatter)
      const oh = gctx.createRadialGradient(gcx, gcy, gR * 0.96, gcx, gcy, gR * 1.32);
      oh.addColorStop(0,    `rgba(230,140,35,${(0.42 * pulse).toFixed(3)})`);
      oh.addColorStop(0.35, `rgba(185,90,15,${(0.18 * pulse).toFixed(3)})`);
      oh.addColorStop(0.72, `rgba(100,45,5,${(0.07 * pulse).toFixed(3)})`);
      oh.addColorStop(1,    'rgba(0,0,0,0)');
      gctx.beginPath();
      gctx.arc(gcx, gcy, gR * 1.32, 0, Math.PI * 2);
      gctx.fillStyle = oh;
      gctx.fill();

      // Layer 4 — hot lens point (sunrise/sunrise-adjacent on the limb)
      const flx = gcx + gR * 0.11;
      const fly = gcy - gR * 0.999;
      const fl  = gctx.createRadialGradient(flx, fly, 0, flx, fly, 80);
      fl.addColorStop(0,    `rgba(255,255,245,${(0.78 * pulse).toFixed(3)})`);
      fl.addColorStop(0.12, `rgba(255,248,190,${(0.55 * pulse).toFixed(3)})`);
      fl.addColorStop(0.35, `rgba(255,220,120,${(0.22 * pulse).toFixed(3)})`);
      fl.addColorStop(1,    'rgba(0,0,0,0)');
      gctx.fillStyle = fl;
      gctx.fillRect(flx - 80, fly - 80, 160, 160);

      // ── Particles ─────────────────────────────────────────────────────
      // Intensified (input focused) → spawn faster/brighter, the "system is
      // now listening" cue from the wireframe spec.
      const boost = intensifiedRef.current ? 2.1 : 1;
      const spawnChance = intensifiedRef.current ? 0.82 : 0.48;
      if (particles.length < 950 && Math.random() < spawnChance) {
        spawnParticle(w, h, gcx, gcy, gR, boost);
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life += p.spd;
        if (p.life >= 1) { particles.splice(i, 1); continue; }

        // Opacity envelope: fade-in 0→0.12, hold 0.12→0.74, fade-out 0.74→1
        let op: number;
        if      (p.life < 0.12) op = (p.life / 0.12) * p.maxOp;
        else if (p.life < 0.74) op = p.maxOp;
        else                    op = ((1 - p.life) / 0.26) * p.maxOp;

        p.x  += p.vx;
        p.y  += p.vy;
        p.vy *= 0.99982;   // very slight deceleration

        // Subtle twinkle
        const tw = 1 + Math.sin(t * (2 + p.sz) + p.x * 0.1) * 0.18;
        const finalOp = Math.min(1, op * tw);

        // Color: warm gold at horizon → cooler champagne as they rise
        const rise = Math.max(0, Math.min(1, 1 - p.y / h));
        const pr = Math.floor(255 - rise * 18);
        const pg = Math.floor(205 - rise * 30);
        const pb = Math.floor(78  + rise * 110);

        gctx.beginPath();
        gctx.arc(p.x, p.y, p.sz, 0, Math.PI * 2);
        gctx.fillStyle = `rgba(${pr},${pg},${pb},${finalOp.toFixed(3)})`;
        gctx.fill();

        // Glow for larger particles
        if (p.sz > 1.0 && finalOp > 0.08) {
          const pg2 = gctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.sz * 4.5);
          pg2.addColorStop(0,  `rgba(255,218,110,${(finalOp * 0.32).toFixed(3)})`);
          pg2.addColorStop(1,  'rgba(0,0,0,0)');
          gctx.fillStyle = pg2;
          gctx.beginPath();
          gctx.arc(p.x, p.y, p.sz * 4.5, 0, Math.PI * 2);
          gctx.fill();
        }
      }

      // ── Vignette ──────────────────────────────────────────────────────
      const vig = gctx.createRadialGradient(w * 0.5, h * 0.44, h * 0.22, w * 0.5, h * 0.50, h * 0.88);
      vig.addColorStop(0,   'rgba(0,0,0,0)');
      vig.addColorStop(0.65,'rgba(0,0,0,0.08)');
      vig.addColorStop(1,   'rgba(0,0,0,0.62)');
      gctx.fillStyle = vig;
      gctx.fillRect(0, 0, w, h);

      animId = requestAnimationFrame(draw);
    }

    animId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
    />
  );
}
