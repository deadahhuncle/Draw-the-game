// A small pooled particle system for cosmetic effects. Uses Math.random (render-side only).

export type ParticleKind = 'dot' | 'spark' | 'smoke' | 'ring' | 'streak' | 'petal';

interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  grow: number;
  color: string;
  g: number;
  drag: number;
  additive: boolean;
  rot: number;
  vr: number;
}

const MAX = 700;

export class Particles {
  private list: Particle[] = [];

  emit(p: Partial<Particle> & { x: number; y: number }): void {
    if (this.list.length >= MAX) this.list.shift();
    this.list.push({
      kind: 'dot',
      vx: 0,
      vy: 0,
      life: 0,
      max: 1,
      size: 3,
      grow: 0,
      color: '#fff',
      g: 0,
      drag: 0,
      additive: true,
      rot: 0,
      vr: 0,
      ...p,
    });
  }

  burst(n: number, x: number, y: number, opts: Partial<Particle> & { speed?: number; spread?: number; angle?: number; jitterLife?: number }): void {
    const speed = opts.speed ?? 120;
    const spread = opts.spread ?? Math.PI * 2;
    const angle = opts.angle ?? 0;
    for (let i = 0; i < n; i++) {
      const a = angle + (Math.random() - 0.5) * spread;
      const s = speed * (0.35 + Math.random() * 0.65);
      const max = (opts.max ?? 0.8) * (1 - (opts.jitterLife ?? 0.4) * Math.random());
      this.emit({ ...opts, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, max, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 6 });
    }
  }

  update(dt: number): void {
    let w = 0;
    for (let i = 0; i < this.list.length; i++) {
      const p = this.list[i];
      p.life += dt;
      if (p.life >= p.max) continue;
      p.vy += p.g * dt;
      const d = Math.max(0, 1 - p.drag * dt);
      p.vx *= d;
      p.vy *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      this.list[w++] = p;
    }
    this.list.length = w;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.list) {
      const t = p.life / p.max;
      const a = t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9;
      const size = Math.max(0.1, p.size + p.grow * p.life);
      ctx.globalCompositeOperation = p.additive ? 'lighter' : 'source-over';
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = p.color;
      ctx.strokeStyle = p.color;
      switch (p.kind) {
        case 'dot':
        case 'smoke':
          ctx.beginPath();
          ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'spark': {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.beginPath();
          for (let k = 0; k < 8; k++) {
            const ang = (k / 8) * Math.PI * 2;
            const r = k % 2 === 0 ? size : size * 0.3;
            ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
          }
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          break;
        }
        case 'ring':
          ctx.lineWidth = Math.max(0.5, 2.5 * (1 - t));
          ctx.beginPath();
          ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
          ctx.stroke();
          break;
        case 'streak': {
          const l = Math.hypot(p.vx, p.vy) * 0.05 + 2;
          const ang = Math.atan2(p.vy, p.vx);
          ctx.lineWidth = size;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - Math.cos(ang) * l, p.y - Math.sin(ang) * l);
          ctx.stroke();
          break;
        }
        case 'petal':
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.beginPath();
          ctx.ellipse(0, 0, size, size * 0.45, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          break;
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  clear(): void {
    this.list.length = 0;
  }
}
