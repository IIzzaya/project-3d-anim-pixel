import * as THREE from 'three/webgpu';
import {
  uniform, uv, vec2, vec3, vec4, float, mix, smoothstep, normalView, positionView,
  sin, cos, dot, fract, floor, max, min, abs, Fn, pass, renderOutput,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { SpriteSettings } from './sprite-settings';

export type EngineStats = { fps: number; backend: string; width: number; height: number; time: number };
type EngineOptions = {
  readSettings: () => SpriteSettings;
  onStats: (stats: EngineStats) => void;
  onError: (message: string) => void;
};

// A closed, cambered membrane. Its root remains at the origin for articulated flapping.
export function wingGeometry(): THREE.BufferGeometry {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  const rows = 40, columns = 16;
  for (let j = 0; j <= rows; j++) {
    const t = j / rows;
    const width = Math.pow(Math.sin(Math.PI * t), 0.78) * (0.23 + t * 0.25);
    for (let i = 0; i <= columns; i++) {
      const s = i / columns * 2 - 1;
      positions.push(t * 0.56 + s * width, t * 1.95, Math.sin(t * Math.PI) * (1 - s * s) * 0.13);
      uvs.push(i / columns, t);
      if (j < rows && i < columns) {
        const a = j * (columns + 1) + i, b = a + columns + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export async function createSpriteEngine(host: HTMLElement, options: EngineOptions, signal: AbortSignal) {
  const renderer = new THREE.WebGPURenderer({ antialias: false, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setClearColor('#050709');
  renderer.toneMapping = THREE.NeutralToneMapping;
  try { await renderer.init(); } catch (error) { renderer.dispose(); throw error; }
  if (signal.aborted) { renderer.dispose(); return null; }
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-label', '可交互的 3D 像素精灵，拖动旋转，滚轮缩放');
  canvas.tabIndex = 0;
  host.appendChild(canvas);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#050709');
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
  camera.position.set(0, 0.6, 9);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 0.38, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.065;
  controls.enablePan = false;
  controls.minDistance = 4.8;
  controls.maxDistance = 16;
  controls.autoRotateSpeed = 0.7;
  controls.minPolarAngle = 0.12;
  controls.maxPolarAngle = Math.PI - 0.12;

  const tint = uniform(new THREE.Color(options.readSettings().hue));
  const clock = uniform(0);
  const sprite = new THREE.Group();
  scene.add(sprite);
  const coreMat = new THREE.MeshBasicNodeMaterial();
  const facing = dot(normalView, positionView.negate().normalize()).clamp(0, 1);
  const edgeColor = tint.rgb.mul(vec3(0.12, 0.35, 0.94));
  const middleColor = tint.mul(1.12);
  const centerColor = mix(tint, vec3(0.91, 1, 0.93), 0.64).mul(1.5);
  const cloudy = sin(normalView.x.mul(22).add(clock.mul(0.9)))
    .mul(cos(normalView.y.mul(19).sub(clock.mul(0.7)))).mul(0.035);
  coreMat.colorNode = mix(mix(edgeColor, middleColor, smoothstep(0.02, 0.62, facing)), centerColor, smoothstep(0.5, 0.98, facing).add(cloudy));
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.72, 64, 40), coreMat);
  sprite.add(core);

  const glowMat = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const radial = uv().sub(0.5).length().mul(2);
  glowMat.colorNode = tint.rgb.mul(vec3(0.22, 0.55, 1));
  glowMat.opacityNode = max(float(0), float(1).sub(radial)).pow(3).mul(0.8);
  const halo = new THREE.Sprite(glowMat);
  halo.scale.set(3.4, 3.4, 1);
  sprite.add(halo);

  const wingMat = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide, transparent: true, depthWrite: false });
  // Voronoi cell borders plus a central vein make a continuous translucent wing surface.
  const veins = Fn(() => {
    const p = uv().mul(vec2(5, 10));
    const cell = floor(p), local = fract(p);
    const closest = float(10).toVar(), second = float(10).toVar();
    for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) {
      const offset = vec2(x, y), point = cell.add(offset);
      const random = fract(sin(vec2(dot(point, vec2(127.1, 311.7)), dot(point, vec2(269.5, 183.3)))).mul(43758.5453));
      const distance = offset.add(random.mul(0.7).add(0.15)).sub(local).length();
      second.assign(min(second, max(closest, distance)));
      closest.assign(min(closest, distance));
    }
    const cells = float(1).sub(smoothstep(0.018, 0.072, second.sub(closest)));
    const center = float(1).sub(smoothstep(0.005, 0.025, abs(uv().x.sub(0.5).add(sin(uv().y.mul(8)).mul(0.035)))));
    const border = smoothstep(0.44, 0.49, abs(uv().x.sub(0.5)));
    return max(cells.mul(0.72), max(center, border));
  })();
  wingMat.colorNode = mix(tint.mul(0.36), mix(tint, vec3(0.85, 1, 0.88), 0.5).mul(1.3), veins);
  wingMat.opacityNode = veins.mul(0.67).add(0.18);
  const wingGeo = wingGeometry();
  const wings: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    for (let pair = 0; pair < 2; pair++) {
      const pivot = new THREE.Group();
      pivot.position.set(side * (pair ? 0.4 : 0.48), pair ? -0.49 : 0.42, -0.13);
      const membrane = new THREE.Mesh(wingGeo, wingMat);
      membrane.scale.set(side, 1, 1);
      pivot.add(membrane);
      pivot.userData = { side, pair };
      wings.push(pivot);
      sprite.add(pivot);
    }
  }

  // Seeded particles are actual 3D instances, so orbiting changes their parallax.
  let seed = 418;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const dustMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  const dust = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), dustMat, 300);
  const seeds = Array.from({ length: 300 }, () => ({ x: (random() - 0.5) * 7.8, y: (random() - 0.5) * 6.2, z: (random() - 0.5) * 5, phase: random() * Math.PI * 2, size: 0.012 + random() * 0.035 }));
  const palette = ['#6bc7ef', '#c6fff2', '#3b57f7', '#9ed66b', '#a594d8'];
  for (let i = 0; i < 300; i++) dust.setColorAt(i, new THREE.Color(palette[i % palette.length]).multiplyScalar(0.4 + random() * 0.9));
  dust.frustumCulled = false;
  scene.add(dust);
  const dummy = new THREE.Object3D();

  const scenePass = pass(scene, camera);
  const sceneColor = scenePass.getTextureNode('output');
  const bloomPass = bloom(sceneColor, 0.65, 0.45, 0.6);
  // r186 renamed getTexture() to getTextureNode(); DefinitelyTyped still exposes the old name.
  const bloomColor = (bloomPass as typeof bloomPass & { getTextureNode(): THREE.TextureNode }).getTextureNode();
  const resolution = uniform(new THREE.Vector2(1, 1));
  const pixelSize = uniform(4), dither = uniform(0.48), levels = uniform(5);
  const aberration = uniform(0.7), grain = uniform(0.08), smooth = uniform(0);
  const pipeline = new THREE.RenderPipeline(renderer);
  const pixel = mix(pixelSize, float(1), smooth);
  const cells = resolution.div(pixel);
  const pixelUV = floor(uv().mul(cells)).add(0.5).div(cells);
  const displacement = vec2(aberration.mul(pixel).div(resolution.x), 0);
  const sample = (at: THREE.Node<'vec2'>) => sceneColor.sample(at).rgb.add(bloomColor.sample(at).rgb);
  const composed = vec3(sample(pixelUV.add(displacement)).r, sample(pixelUV).g, sample(pixelUV.sub(displacement)).b);
  const display = renderOutput(vec4(composed, 1), THREE.NeutralToneMapping, THREE.SRGBColorSpace).rgb;
  // Analytic 4x4 Bayer matrix: 4 * Bayer2(low bits) + Bayer2(high bits).
  const coord = floor(uv().mul(cells));
  const bayer2 = (p: THREE.Node<'vec2'>) => {
    const x = p.x.mod(2), y = p.y.mod(2);
    return x.mul(2).add(y.mul(3)).sub(x.mul(y).mul(4));
  };
  const threshold = bayer2(coord).mul(4).add(bayer2(floor(coord.div(2)))).add(0.5).div(16).sub(0.5);
  const noise = fract(sin(dot(coord.add(floor(clock.mul(12))), vec2(12.9898, 78.233))).mul(43758.5453)).sub(0.5);
  const quantized = floor(display.mul(levels).add(threshold.mul(dither).mul(1.7)).add(noise.mul(grain).mul(2)).add(0.5)).div(levels).clamp(0, 1);
  pipeline.outputColorTransform = false;
  pipeline.outputNode = vec4(mix(quantized, display, smooth), 1);

  let width = 1, height = 1, alive = true, frameId = 0;
  let elapsed = 0, previous = performance.now(), fpsStart = previous, frames = 0;
  const resize = () => {
    width = Math.max(1, host.clientWidth); height = Math.max(1, host.clientHeight);
    renderer.setSize(width, height);
    resolution.value.set(width * renderer.getPixelRatio(), height * renderer.getPixelRatio());
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host); resize();
  const backend = (renderer.backend as unknown as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'WebGPU' : 'WebGL 2';

  const render = (now: number) => {
    if (!alive) return;
    const dt = Math.min((now - previous) / 1000, 0.05); previous = now;
    const settings = options.readSettings();
    if (!document.hidden) {
      if (settings.playing) elapsed += dt * settings.speed;
      clock.value = elapsed;
      tint.value.set(settings.hue);
      pixelSize.value = settings.pixelSize * renderer.getPixelRatio();
      dither.value = settings.dither; levels.value = settings.colorLevels;
      bloomPass.strength.value = settings.bloom;
      aberration.value = settings.aberration;
      grain.value = settings.grain;
      smooth.value = settings.smooth ? 1 : 0;
      sprite.position.y = Math.sin(elapsed * 1.65) * settings.hover * 0.35;
      sprite.rotation.z = Math.sin(elapsed * 1.2) * 0.035;
      core.scale.setScalar(settings.bodySize);
      for (const wing of wings) {
        const { side, pair } = wing.userData;
        const beat = Math.sin(elapsed * settings.flapSpeed * Math.PI * 2 + pair * 0.65);
        wing.rotation.y = side * (0.22 + beat * 0.72);
        wing.rotation.z = side * (pair ? 2.48 : -0.26 + beat * 0.09);
        wing.scale.setScalar(settings.wingSpan * (pair ? 0.32 : 1));
      }
      dust.count = settings.particles;
      for (let i = 0; i < dust.count; i++) {
        const item = seeds[i];
        dummy.position.set(item.x + Math.sin(elapsed * 0.25 + item.phase) * 0.18, ((item.y + 3.1 + elapsed * 0.1) % 6.2) - 3.1, item.z);
        dummy.quaternion.copy(camera.quaternion);
        dummy.scale.setScalar(item.size * (0.6 + Math.sin(elapsed * 1.3 + item.phase) * 0.4));
        dummy.updateMatrix(); dust.setMatrixAt(i, dummy.matrix);
      }
      dust.instanceMatrix.needsUpdate = true;
      controls.autoRotate = settings.autoRotate && settings.playing;
      controls.update(dt);
      try { pipeline.render(); } catch (error) {
        options.onError(error instanceof Error ? error.message : '渲染失败');
        alive = false; return;
      }
      frames++;
      if (now - fpsStart > 700) {
        options.onStats({ fps: Math.round(frames * 1000 / (now - fpsStart)), backend, width: Math.round(width), height: Math.round(height), time: elapsed });
        fpsStart = now; frames = 0;
      }
    } else { fpsStart = now; frames = 0; }
    frameId = requestAnimationFrame(render);
  };
  frameId = requestAnimationFrame(render);

  return {
    resetCamera() { camera.position.set(0, 0.6, 9); controls.target.set(0, 0.38, 0); controls.update(); },
    setView(view: 'front' | 'side') { camera.position.set(view === 'side' ? 9 : 0, 0.6, view === 'side' ? 0 : 9); controls.update(); },
    zoom(factor: number) { const offset = camera.position.clone().sub(controls.target); offset.setLength(THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance)); camera.position.copy(controls.target).add(offset); controls.update(); },
    restart() { elapsed = 0; },
    async screenshot(): Promise<Blob> {
      pipeline.render();
      return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('无法导出画面')), 'image/png'));
    },
    dispose() {
      alive = false; cancelAnimationFrame(frameId); observer.disconnect(); controls.dispose();
      pipeline.dispose(); bloomPass.dispose(); scenePass.dispose();
      core.geometry.dispose(); coreMat.dispose(); glowMat.dispose(); wingGeo.dispose(); wingMat.dispose(); dust.geometry.dispose(); dustMat.dispose();
      renderer.dispose(); canvas.remove();
    },
  };
}

export type SpriteEngine = NonNullable<Awaited<ReturnType<typeof createSpriteEngine>>>;
