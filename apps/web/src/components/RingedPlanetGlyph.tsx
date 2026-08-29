import { useEffect, useRef } from 'react';

// ── OIANO's last O — Earth, circled by its own small sun ──────────────────
// Pivoted away from a Saturn-style multi-band ring (read as generic "ringed
// planet" clip art, not something that's OIANO's) to the brand's own idea:
// the last O is Earth, lit from the first O's side (the fire/sun O), orbited
// by a single slanted gold ring-path along which a small bright spark --
// OIANO's own miniature sun -- actually travels. Motion sells "circled by
// the sun" far better than a static ring, so this animates via rAF (and
// respects prefers-reduced-motion by holding one static frame).
export default function RingedPlanetGlyph({ size = 220, showPlanet = true }: { size?: number; showPlanet?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;
    const ctx = ctx2d; // re-bind so TS narrows the type inside nested closures below

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = size * 1.5;
    const H = size * 1.15;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    // No canvas.style.width/height here on purpose — the wrapper
    // (.enter-ringed-o-slot) sizes itself as a percentage of the wordmark
    // container, same as the wordmark image, and the canvas's own CSS
    // (width:100%;height:auto, set in the JSX below) rides along with it.
    // Fixing the display size here in px was what let this glyph drift out
    // of alignment with the letters whenever the viewport resized.
    ctx.scale(dpr, dpr);

    const cx = W * 0.5;
    const cy = H * 0.52;
    const planetR = size * 0.34;

    // Single slanted orbit path — a ring-path, not a Saturn band.
    const ringRx = planetR * 1.85;
    const ringRy = planetR * 0.62;
    const ringRotation = -0.32;

    function ringPath() {
      const p = new Path2D();
      p.ellipse(cx, cy, ringRx, ringRy, ringRotation, 0, Math.PI * 2);
      return p;
    }

    function drawRing(half: 'back' | 'front') {
      ctx.save();
      const clip = new Path2D();
      if (half === 'back') clip.rect(0, 0, W, cy);
      else clip.rect(0, cy, W, H - cy);
      ctx.clip(clip);
      ctx.globalAlpha = half === 'back' ? 0.35 : 1;
      ctx.strokeStyle = '#e2c97e';
      ctx.lineWidth = 3.2;
      ctx.shadowColor = 'rgba(226,201,126,.65)';
      ctx.shadowBlur = 9;
      ctx.stroke(ringPath());
      ctx.restore();
    }

    function drawPlanet() {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, planetR, 0, Math.PI * 2);
      ctx.clip();

      // ocean base, lit from the left — the first O / sun side
      const base = ctx.createRadialGradient(
        cx - planetR * 0.45, cy - planetR * 0.35, planetR * 0.15,
        cx, cy, planetR * 1.1,
      );
      base.addColorStop(0, '#bfe4e0');
      base.addColorStop(0.22, '#3f93ad');
      base.addColorStop(0.55, '#1c5c78');
      base.addColorStop(1, '#07182a');
      ctx.fillStyle = base;
      ctx.fillRect(cx - planetR, cy - planetR, planetR * 2, planetR * 2);

      // stylized landmasses, warm gold-green to stay in-brand — kept small/
      // translucent so the ocean base still reads as blue, not just gold
      ctx.fillStyle = 'rgba(150,140,70,.55)';
      const blobs: Array<[number, number, number, number]> = [
        [-0.3, -0.25, 0.4, 0.26],
        [0.15, 0.05, 0.32, 0.22],
        [-0.1, 0.4, 0.24, 0.16],
      ];
      for (const [bx, by, bw, bh] of blobs) {
        ctx.beginPath();
        ctx.ellipse(cx + bx * planetR, cy + by * planetR, bw * planetR, bh * planetR, 0.4, 0, Math.PI * 2);
        ctx.fill();
      }

      // cloud wisps
      ctx.fillStyle = 'rgba(255,255,255,.16)';
      ctx.filter = 'blur(2px)';
      ctx.beginPath();
      ctx.ellipse(cx + planetR * 0.2, cy - planetR * 0.3, planetR * 0.5, planetR * 0.12, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx - planetR * 0.15, cy + planetR * 0.25, planetR * 0.4, planetR * 0.1, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.filter = 'none';

      // terminator shading — dark side away from the sun (right)
      const shade = ctx.createRadialGradient(
        cx + planetR * 0.6, cy, planetR * 0.1,
        cx + planetR * 0.6, cy, planetR * 1.3,
      );
      shade.addColorStop(0, 'rgba(0,0,0,0)');
      shade.addColorStop(1, 'rgba(0,0,0,.6)');
      ctx.fillStyle = shade;
      ctx.fillRect(cx - planetR, cy - planetR, planetR * 2, planetR * 2);
      ctx.restore();

      // gold rim-light on the sunward edge — ties this O back to the first O
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const rim = ctx.createRadialGradient(
        cx - planetR * 0.9, cy - planetR * 0.2, planetR * 0.7,
        cx - planetR * 0.9, cy - planetR * 0.2, planetR * 1.15,
      );
      rim.addColorStop(0, 'rgba(0,0,0,0)');
      rim.addColorStop(0.92, 'rgba(0,0,0,0)');
      rim.addColorStop(1, 'rgba(255,224,150,.3)');
      ctx.beginPath();
      ctx.arc(cx, cy, planetR * 1.02, 0, Math.PI * 2);
      ctx.fillStyle = rim;
      ctx.fill();
      ctx.restore();
    }

    function sparkPosition(t: number) {
      const lx = Math.cos(t) * ringRx;
      const ly = Math.sin(t) * ringRy;
      const x = cx + lx * Math.cos(ringRotation) - ly * Math.sin(ringRotation);
      const y = cy + lx * Math.sin(ringRotation) + ly * Math.cos(ringRotation);
      return { x, y, behind: y < cy };
    }

    function drawSpark(x: number, y: number) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const glowR = size * 0.13;
      const g = ctx.createRadialGradient(x, y, 0, x, y, glowR);
      g.addColorStop(0, 'rgba(255,246,210,1)');
      g.addColorStop(0.3, 'rgba(255,214,120,.9)');
      g.addColorStop(1, 'rgba(255,214,120,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, glowR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff8e6';
      ctx.beginPath();
      ctx.arc(x, y, size * 0.03, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function render(t: number) {
      ctx.clearRect(0, 0, W, H);
      drawRing('back');
      const spark = sparkPosition(t);
      if (spark.behind) drawSpark(spark.x, spark.y);
      if (showPlanet) drawPlanet();
      drawRing('front');
      if (!spark.behind) drawSpark(spark.x, spark.y);
    }

    if (reduceMotion) {
      render(-0.7);
      return;
    }

    let raf = 0;
    const start = performance.now();
    function frame(now: number) {
      const t = ((now - start) / 1000) * ((Math.PI * 2) / 7); // ~7s per revolution
      render(t);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [size]);

  return <canvas ref={ref} aria-hidden="true" style={{ display: 'block', width: '100%', height: 'auto' }} />;
}
