export type SpriteSettings = {
  pixelSize: number; dither: number; colorLevels: number; bloom: number;
  aberration: number; grain: number; speed: number; wingSpan: number;
  flapSpeed: number; hover: number; particles: number; bodySize: number;
  hue: string; autoRotate: boolean; playing: boolean; grid: boolean;
  smooth: boolean;
};

export const defaults: SpriteSettings = {
  pixelSize: 4, dither: 0.48, colorLevels: 5, bloom: 0.65,
  aberration: 0.7, grain: 0.08, speed: 1, wingSpan: 1,
  flapSpeed: 1.8, hover: 0.3, particles: 100, bodySize: 1,
  hue: '#80eaff', autoRotate: false, playing: true, grid: true,
  smooth: false,
};

export const presets = [
  { id: 'navi', name: '蓝光精灵', subtitle: '参考原作', color: '#90edff', settings: {} },
  { id: 'forest', name: '森林微光', subtitle: '翡翠 · 轻盈', color: '#a8ff99', settings: { hue: '#a8ff99', bloom: 0.85, pixelSize: 3, dither: 0.35, flapSpeed: 1.3, particles: 150 } },
  { id: 'dream', name: '紫雾梦境', subtitle: '紫晶 · 漂浮', color: '#c4a0ff', settings: { hue: '#c4a0ff', bloom: 1.1, pixelSize: 3, aberration: 1.4, flapSpeed: 1.1, hover: 0.5 } },
  { id: 'retro', name: '8-bit 回声', subtitle: '粗颗粒 · 复古', color: '#ffcf85', settings: { hue: '#ffcf85', pixelSize: 8, colorLevels: 3, dither: 0.75, bloom: 0.35, grain: 0.22 } },
] as const;

export const ranges = {
  pixelSize: [1, 16, 1], dither: [0, 1, 0.01], colorLevels: [2, 16, 1],
  bloom: [0, 2, 0.01], aberration: [0, 3, 0.1], grain: [0, 0.6, 0.01],
  speed: [0.1, 2, 0.1], wingSpan: [0.5, 1.6, 0.01], flapSpeed: [0, 5, 0.1],
  hover: [0, 0.8, 0.01], particles: [0, 300, 1], bodySize: [0.6, 1.4, 0.01],
} as const;

export function presetSettings(id: string): SpriteSettings {
  const preset = presets.find((item) => item.id === id);
  return { ...defaults, ...preset?.settings };
}

/** Validate imported or agent-provided parameters before they reach GPU uniforms. */
export function sanitizeSettings(input: unknown): SpriteSettings {
  const result = { ...defaults };
  if (!input || typeof input !== 'object') return result;
  const data = input as Record<string, unknown>;
  for (const key of Object.keys(ranges) as (keyof typeof ranges)[]) {
    const value = data[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      const [min, max, step] = ranges[key];
      result[key] = Math.max(min, Math.min(max, Math.round(value / step) * step));
    }
  }
  for (const key of ['autoRotate', 'playing', 'grid', 'smooth'] as const) {
    if (typeof data[key] === 'boolean') result[key] = data[key];
  }
  if (typeof data.hue === 'string' && /^#[0-9a-f]{6}$/i.test(data.hue)) result.hue = data.hue;
  return result;
}
