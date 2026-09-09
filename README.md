# LUMA · 像素精灵工作台

参考仓库中的 `ref.mp4`，用可旋转的程序化 3D 场景重建蓝色光球精灵、两对半透明翅膀、振翅和悬浮，再叠加像素、抖色、辉光、色散与颗粒效果。

## 启动

需要 Node.js 22.13 或更新版本。

```sh
npm ci
npm run dev
```

打开终端显示的 Local 地址。开发服务器默认从 3000 端口开始，端口占用时会自动选择下一个端口。

```sh
npm run build      # 生产构建
npm start          # 本地运行生产 Worker
npm run typecheck  # TypeScript 检查
npm run lint       # 应用与测试代码检查
npm test           # 参数验证测试
npm run test:gpu   # 原生 GPU 集成测试，需要可用的 WebGPU 适配器
```

项目已使用 Git 管理；`ref.mp4` 保留为原始参考。`node_modules`、构建产物、临时参考帧和测试输出不入库。

## 操作

| 操作 | 效果 |
| --- | --- |
| 鼠标拖动 / 单指拖动 | 旋转三维视角 |
| 鼠标滚轮 / 双指缩放 | 调节观察距离 |
| 空格 | 播放或暂停动画 |
| R | 恢复初始视角 |
| F / Esc | 进入或退出沉浸模式 |
| 画面特效 | 像素尺寸、Bayer 抖色、色阶、辉光、色散、颗粒、颜色 |
| 对象与动画 | 球体大小、翅膀大小、粒子数量、速度、振翅、悬浮、自动旋转 |
| 查看原始 3D | 关闭像素化、抖色、颗粒与色散，保留造型和辉光 |
| 导出画面 | 导出当前视角和当前帧的 PNG，不包含编辑器界面 |

四套预设可以继续修改；“重置”恢复参考预设和初始视角。暂停固定动画时间和颗粒噪声，仍可旋转观察及修改参数。

## 实现

- React 19、TypeScript、Vinext / Vite，Base UI + Shadcn 控件。
- Three.js `WebGPURenderer`：优先使用 WebGPU，不可用时由 Three.js 回退至 WebGL 2。
- `lib/sprite-engine.ts`：参数化弯曲翅膜几何、Voronoi 翅脉、球面视角渐变、四翼关节运动和 300 个以内的实例粒子。
- 后处理顺序：3D 场景 → 辉光 → 像素 UV 采样与 RGB 偏移 → 色调映射 → 4×4 Bayer 抖色 / 量化 / 动态颗粒。
- 全部材质和后处理采用 TSL，编译为 WebGPU 的 WGSL 或 WebGL 2 的 GLSL；没有预渲染视频冒充交互场景。
- 渲染与 React 面板分开更新；帧间隔限制 50ms；像素比上限 1.5；页面隐藏时跳过渲染；卸载时释放 GPU 资源和事件。
- `lib/sprite-settings.ts`：统一参数范围、预设和输入校验。
- `lib/webmcp.ts`：可选 WebMCP 参数读取与批量配置；不支持此接口的浏览器继续正常使用可见控件。
- `public/presets/`：由同一渲染器实际输出的预设缩略图，可运行 `npm run previews` 更新。

## 验证与边界

`test:gpu` 通过 Dawn 在 Node 中实际编译并执行 WebGPU 着色器，将 GPU 纹理读回，验证：主体可见、暂停确定性、原始 3D 模式差异、侧视角差异、相机重置、预设变化、极端参数及动画变化。测试 PNG 输出至 `outputs/`。这是原生 GPU 集成测试，**不等于浏览器端到端测试**。

WebGL 2 回退、浏览器 PNG 下载、触控和响应式交互尚未做浏览器实测。WebMCP 做了功能实现，但当前没有支持的页面工具验证上下文，未声称通过实际注册和调用验证。内置第三方 UI 目录保留生成器原样，不参与应用 lint；仍参与 TypeScript 检查。

依赖检查已升级 React、Vinext、Vite 与 Cloudflare 工具链。`npm audit` 仍报告 4 条关联的高风险条目，来源是本地开发工具 Miniflare 使用的 `sharp` / libheif；审计给出的自动方案是降级整套工具，未采用。这些工具不打入前端资源；本项目也不接受用户图片上传或调用图片优化服务。

此项目是依据视频进行的程序化重建；原视频未提供 Blender 模型和节点数据，因此翅脉与材质不保证逐像素一致。独立调整球体或翅膀至极端尺寸可能导致关节视觉上分离。导出的是当前画布分辨率 PNG，不包含 GIF / 视频导出。

参考技术资料：[Three.js WebGPURenderer](https://threejs.org/docs/pages/WebGPURenderer.html)、[RenderPipeline](https://threejs.org/docs/pages/RenderPipeline.html)、[Dawn Node WebGPU](https://github.com/dawn-gpu/node-webgpu)。
