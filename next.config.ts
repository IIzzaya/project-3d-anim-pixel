import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // GitHub Pages serves this project under https://iizzaya.github.io/project-3d-anim-pixel/
  basePath: '/project-3d-anim-pixel',
  // NOTE: `output: 'export'` is intentionally NOT set (same as project-jelly /
  // project-qing-font): vinext cannot combine basePath with build-time
  // prerendering (the prerenderer requests basePath-less URLs and the RSC
  // handler answers 404). Instead, `scripts/prerender.mjs` boots the built
  // worker and freezes the SSR HTML into dist/client/project-3d-anim-pixel/,
  // which the Pages workflow deploys.
  //
  // Public assets referenced from JSX (`/presets/...`, `/reference.jpg`,
  // `/favicon.svg`) are NOT rewritten by basePath — they are prefixed via
  // `BASE_PATH` from `lib/paths.ts`.
};

export default nextConfig;
