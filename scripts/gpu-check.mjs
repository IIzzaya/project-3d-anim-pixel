// Native Dawn/WebGPU integration check. No browser or DOM automation is involved.
import { create, globals } from 'webgpu';
import { writeFile, mkdir } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import assert from 'node:assert/strict';
Object.assign(globalThis, globals);
const gpu = create([]);
Object.defineProperty(globalThis, 'navigator', { value: { gpu, userAgent: 'Node GPU verification' }, configurable: true });
const frames = new Map(); let frameId = 0;
globalThis.requestAnimationFrame = (callback) => { frames.set(++frameId, callback); return frameId; };
globalThis.cancelAnimationFrame = (id) => frames.delete(id);
globalThis.window = { devicePixelRatio: 1 };
globalThis.self = globalThis;
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
const noop = () => {};
let canvas;
class GPUCanvas {
  width = 900; height = 600; style = {}; ownerDocument = globalThis.document;
  addEventListener = noop; removeEventListener = noop; setAttribute = noop; remove = noop;
  getRootNode() { return globalThis.document; }
  getContext() {
    const surface = this;
    return this.context ??= {
      canvas: surface,
      configure(config) { this.config = config; },
      unconfigure() {},
      getCurrentTexture() {
        if (!surface.texture || surface.texture.width !== surface.width || surface.texture.height !== surface.height) {
          surface.texture?.destroy();
          surface.texture = this.config.device.createTexture({
            size: [surface.width, surface.height], format: this.config.format,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC | GPUTextureUsage.TEXTURE_BINDING,
          });
        }
        return surface.texture;
      },
    };
  }
}
globalThis.document = { hidden: false, addEventListener: noop, removeEventListener: noop, createElementNS: () => (canvas = new GPUCanvas()) };
const host = { clientWidth: 900, clientHeight: 600, appendChild: noop };
const { createSpriteEngine } = await import('../lib/sprite-engine.ts');
const { defaults, presetSettings } = await import('../lib/sprite-settings.ts');
let settings = { ...defaults, playing: false };
const errors = [];
const originalError = console.error;
console.error = (...args) => { errors.push(args.join(' ')); originalError(...args); };
let engine;
try {
  engine = await createSpriteEngine(host, { readSettings: () => settings, onStats: noop, onError: (message) => errors.push(message) }, new AbortController().signal);
  assert.ok(engine, 'Engine initializes');
  async function render() {
    const pending = [...frames.values()]; frames.clear();
    for (const callback of pending) callback(performance.now());
    await canvas.context.config.device.queue.onSubmittedWorkDone();
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(errors.length, 0, errors.join('\n'));
  }
  async function read() {
    const device = canvas.context.config.device;
    const w = canvas.width, h = canvas.height, stride = Math.ceil(w * 4 / 256) * 256;
    const buffer = device.createBuffer({ size: stride * h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const encoder = device.createCommandEncoder();
    encoder.copyTextureToBuffer({ texture: canvas.texture }, { buffer, bytesPerRow: stride }, [w, h]);
    device.queue.submit([encoder.finish()]);
    await buffer.mapAsync(GPUMapMode.READ);
    const mapped = new Uint8Array(buffer.getMappedRange());
    const rgba = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) rgba.set(mapped.subarray(y * stride, y * stride + w * 4), y * w * 4);
    if (canvas.context.config.format.startsWith('bgra')) for (let i = 0; i < rgba.length; i += 4) [rgba[i], rgba[i + 2]] = [rgba[i + 2], rgba[i]];
    buffer.unmap(); buffer.destroy();
    return rgba;
  }
  function png(rgba, w, h) {
    const crc32 = (data) => { let crc = 0xffffffff; for (const byte of data) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; };
    const chunk = (type, data) => { const name = Buffer.from(type), size = Buffer.alloc(4), crc = Buffer.alloc(4); size.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([name, data]))); return Buffer.concat([size, name, data, crc]); };
    const header = Buffer.alloc(13); header.writeUInt32BE(w); header.writeUInt32BE(h, 4); header[8] = 8; header[9] = 6;
    const raw = Buffer.alloc((w * 4 + 1) * h);
    for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
    return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  }
  await mkdir('outputs', { recursive: true });
  await render(); await render();
  const initial = await read();
  const bright = initial.filter((channel, index) => index % 4 !== 3 && channel > 100).length;
  assert.ok(bright > 12000, `Scene contains a visible subject (${bright} bright channels)`);
  await writeFile('outputs/gpu-default.png', png(initial, canvas.width, canvas.height));
  await render(); assert.deepEqual(await read(), initial, 'Paused rendering is deterministic');
  settings = { ...settings, smooth: true }; await render();
  const smooth = await read(); assert.notDeepEqual(smooth, initial, 'Smooth mode changes the image');
  await writeFile('outputs/gpu-smooth.png', png(smooth, canvas.width, canvas.height));
  engine.setView('side'); await render(); assert.notDeepEqual(await read(), smooth, 'Side view changes 3D projection');
  engine.resetCamera(); await render(); assert.deepEqual(await read(), smooth, 'Reset restores camera exactly');
  settings = { ...presetSettings('forest'), playing: false }; await render();
  assert.notDeepEqual(await read(), initial, 'Preset changes rendering');
  await writeFile('outputs/gpu-forest.png', png(await read(), canvas.width, canvas.height));
  if (process.argv.includes('--update-previews')) {
    await mkdir('public/presets', { recursive: true });
    for (const id of ['navi', 'forest', 'dream', 'retro']) {
      settings = { ...presetSettings(id), playing: false }; await render();
      await writeFile(`public/presets/${id}.png`, png(await read(), canvas.width, canvas.height));
    }
  }
  settings = { ...defaults, pixelSize: 16, colorLevels: 2, particles: 300, bloom: 2, grain: 0.6, playing: false };
  await render();
  settings = { ...defaults, particles: 0, bloom: 0, dither: 0, playing: false }; await render();
  settings.playing = true; await render(); const animated = await read(); await render(); assert.notDeepEqual(await read(), animated, 'Animation changes rendered output');
  console.log('PASS: Native WebGPU shader compilation, visible scene, pause, smooth mode, side view, camera reset, preset, parameter extremes and animation.');
} finally {
  engine?.dispose(); canvas?.texture?.destroy();
  console.error = originalError;
  delete globalThis.navigator;
}
process.exit(0);
