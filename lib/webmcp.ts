import { flushSync } from 'react-dom';
import { presets, presetSettings, ranges, sanitizeSettings, type SpriteSettings } from './sprite-settings';

type Tool = { name: string; description: string; inputSchema: object; annotations: { readOnlyHint: boolean }; execute: (input: unknown) => unknown };
type ModelContext = { registerTool: (tool: Tool, options: { signal: AbortSignal }) => void | Promise<void> };

export function registerSpriteTools(read: () => SpriteSettings, apply: (settings: SpriteSettings, preset?: string) => void) {
  const context = (document as Document & { modelContext?: ModelContext }).modelContext;
  if (!context?.registerTool) return () => {};
  const lifecycle = new AbortController();
  const parameters = Object.fromEntries(Object.entries(ranges).map(([name, [min, max]]) => [name, { type: 'number', minimum: min, maximum: max }]));
  const tools: Tool[] = [
    { name: 'read_sprite_settings', description: 'Read the active pixel sprite appearance and animation parameters.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true }, execute: () => ({ ...read() }) },
    {
      name: 'configure_sprite', description: 'Apply a preset and/or a batch of parameters to the visible 3D sprite. Unspecified settings remain unchanged.',
      inputSchema: { type: 'object', properties: { preset: { type: 'string', enum: presets.map((p) => p.id) }, settings: { type: 'object', additionalProperties: false, properties: { ...parameters, hue: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' }, playing: { type: 'boolean' }, autoRotate: { type: 'boolean' }, grid: { type: 'boolean' }, smooth: { type: 'boolean' } } } }, additionalProperties: false },
      annotations: { readOnlyHint: false },
      execute(input) {
        if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected a configuration object');
        const data = input as { preset?: unknown; settings?: unknown };
        if (Object.keys(data).some((key) => key !== 'preset' && key !== 'settings')) throw new Error('Unknown configuration field');
        if (data.preset !== undefined && !presets.some((p) => p.id === data.preset)) throw new Error('Unknown sprite preset');
        if (data.settings !== undefined && (!data.settings || typeof data.settings !== 'object' || Array.isArray(data.settings))) throw new Error('Expected a settings object');
        const base = typeof data.preset === 'string' ? presetSettings(data.preset) : read();
        for (const [key, value] of Object.entries(data.settings ?? {})) {
          if (!Object.hasOwn(base, key) || typeof value !== typeof base[key as keyof SpriteSettings]) throw new Error(`Invalid setting: ${key}`);
          if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`Expected finite number: ${key}`);
          if (key === 'hue' && !/^#[0-9a-f]{6}$/i.test(String(value))) throw new Error('Invalid hex color');
        }
        const next = sanitizeSettings({ ...base, ...data.settings as object });
        flushSync(() => apply(next, typeof data.preset === 'string' ? data.preset : undefined));
        return { settings: next };
      },
    },
  ];
  for (const tool of tools) {
    try { void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch { /* Optional browser capability; UI remains available. */ }
  }
  return () => lifecycle.abort();
}
