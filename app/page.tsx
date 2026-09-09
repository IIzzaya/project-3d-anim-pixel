'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDownToLine, ArrowUpRight, Box, Check, ChevronRight, CircleHelp, Expand, Focus, Grid2X2, Layers3, LoaderCircle, Minus, MousePointer2, Move3D, Pause, Play, Plus, RotateCcw, Rotate3D, Settings2, Sparkles, Square, Video, WandSparkles, X } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { defaults, presets, presetSettings, ranges, type SpriteSettings } from '@/lib/sprite-settings';
import type { SpriteEngine, EngineStats } from '@/lib/sprite-engine';
import { registerSpriteTools } from '@/lib/webmcp';

function IconButton({ label, children, active, onClick }: { label: string; children: ReactNode; active?: boolean; onClick: () => void }) {
  return <Tooltip><TooltipTrigger render={<button className={`icon-button ${active ? 'active' : ''}`} aria-label={label} aria-pressed={active} onClick={onClick} />}>{children}</TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>;
}
function RangeControl({ label, name, settings, change, suffix = '', digits = 2 }: {
  label: string; name: keyof typeof ranges; settings: SpriteSettings;
  change: <K extends keyof SpriteSettings>(key: K, value: SpriteSettings[K]) => void;
  suffix?: string; digits?: number;
}) {
  const [min, max, step] = ranges[name];
  return <div className="range-control"><div className="range-label"><label id={`label-${name}`}>{label}</label><output>{settings[name].toFixed(digits)}<span>{suffix}</span></output></div><Slider aria-labelledby={`label-${name}`} value={[settings[name]]} min={min} max={max} step={step} onValueChange={(value) => change(name, Array.isArray(value) ? value[0] : value)} /></div>;
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <div className="toggle-row"><span>{label}</span><Switch aria-label={label} checked={checked} onCheckedChange={onChange} /></div>;
}
function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Home() {
  const [settings, setSettings] = useState<SpriteSettings>({ ...defaults });
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  const [preset, setPreset] = useState('navi');
  const [stats, setStats] = useState<EngineStats>({ fps: 0, backend: '初始化', width: 0, height: 0, time: 0 });
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [reference, setReference] = useState(false);
  const [help, setHelp] = useState(false);
  const [toast, setToast] = useState('');
  const [exporting, setExporting] = useState(false);
  const [tab, setTab] = useState('effects');
  const [immersive, setImmersive] = useState(false);
  const host = useRef<HTMLDivElement>(null), engine = useRef<SpriteEngine | null>(null);
  const change = useCallback(<K extends keyof SpriteSettings>(key: K, value: SpriteSettings[K]) => { setSettings((current) => ({ ...current, [key]: value })); }, []);
  useEffect(() => registerSpriteTools(() => settingsRef.current, (next, id) => { settingsRef.current = next; setSettings(next); if (id) setPreset(id); }), []);
  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const pauseIfReduced = () => { if (motion.matches) setSettings((current) => ({ ...current, playing: false })); };
    const initial = requestAnimationFrame(pauseIfReduced);
    motion.addEventListener('change', pauseIfReduced);
    return () => { cancelAnimationFrame(initial); motion.removeEventListener('change', pauseIfReduced); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let instance: SpriteEngine | null = null;
    const element = host.current;
    if (!element) return;
    import('@/lib/sprite-engine').then(({ createSpriteEngine }) => createSpriteEngine(element, {
      readSettings: () => settingsRef.current,
      onStats: (value) => { if (!controller.signal.aborted) { setStats(value); setReady(true); } },
      onError: (message) => { if (!controller.signal.aborted) setError(message); },
    }, controller.signal)).then((result) => {
      instance = result;
      if (controller.signal.aborted) instance?.dispose(); else engine.current = instance;
    }).catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '浏览器未能初始化图形引擎'); });
    return () => { controller.abort(); instance?.dispose(); engine.current = null; };
  }, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 2800); return () => clearTimeout(timer); }, [toast]);
  const reset = useCallback(() => { setSettings({ ...defaults }); setPreset('navi'); engine.current?.resetCamera(); engine.current?.restart(); setToast('已恢复参考效果'); }, []);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.ctrlKey || event.metaKey || event.altKey || target.closest('input, textarea, button, [role="slider"], [role="dialog"], [role="tab"], [contenteditable]')) return;
      if (event.code === 'Space') { event.preventDefault(); setSettings((s) => ({ ...s, playing: !s.playing })); }
      if (event.key.toLowerCase() === 'r') engine.current?.resetCamera();
      if (event.key.toLowerCase() === 'f') setImmersive((value) => !value);
      if (event.key === 'Escape') setImmersive(false);
      if (event.key === '?') setHelp(true);
    };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  }, []);
  const exportImage = async () => {
    if (!engine.current) return;
    setExporting(true);
    try { download(await engine.current.screenshot(), `luma-${preset}-${Date.now()}.png`); setToast('画面已导出为 PNG'); }
    catch { setToast('导出失败，请稍后重试'); } finally { setExporting(false); }
  };
  const selectPreset = (id: string) => { setPreset(id); setSettings((current) => ({ ...presetSettings(id), playing: current.playing, autoRotate: current.autoRotate, grid: current.grid })); };
  const currentPreset = presets.find((item) => item.id === preset)!;
  const rangeProps = { settings, change };

  return <TooltipProvider delay={250}><main className={`studio ${immersive ? 'immersive' : ''}`}>
    <header className="topbar"><Link className="brand" href="/" aria-label="LUMA 工作台"><span className="brand-mark"><span /><span /><span /><span /></span><strong>LUMA</strong><span className="brand-sub">PIXEL STUDIO</span></Link><div className="breadcrumb">实验室 <ChevronRight size={13} /><span>精灵研究 001</span><span className="beta-label">LIVE</span></div><div className="header-actions"><button className="quiet-button" onClick={() => setReference(true)}><Video size={16} /><span>参考画面</span><ArrowUpRight size={14} /></button><button className="export-button" onClick={exportImage} disabled={!ready || exporting || !!error}>{exporting ? <LoaderCircle className="spin" size={16} /> : <ArrowDownToLine size={16} />}<span>导出画面</span></button></div></header>
    <nav className="tool-rail" aria-label="工作台工具"><div className="rail-top"><IconButton label="特效工作台" active={tab === 'effects'} onClick={() => setTab('effects')}><WandSparkles /></IconButton><IconButton label="对象与动画" active={tab === 'object'} onClick={() => setTab('object')}><Box /></IconButton><span className="rail-divider" /><IconButton label="查看参考" onClick={() => setReference(true)}><Layers3 /></IconButton></div><IconButton label="操作帮助" onClick={() => setHelp(true)}><CircleHelp /></IconButton></nav>
    <section className="workspace" aria-label="精灵预览工作区">
      <div className="workspace-heading"><div><div className="eyebrow"><span />REALTIME CREATURE LAB</div><h1>一点像素，一点魔法<span>。</span></h1></div><span className="scene-number">SCENE / 001</span></div>
      <div className={`viewport ${settings.grid ? 'with-grid' : ''}`}><div ref={host} className="canvas-host" /><div className="viewport-top"><div className="viewport-tag"><span className="live-dot" />{settings.smooth ? '原始 3D' : '像素渲染'}<span className="tag-separator" />{settings.smooth ? 'SMOOTH' : 'PIXEL'}</div><button className="view-reset" onClick={() => engine.current?.resetCamera()}><Focus size={14} />重置视角</button></div><div className="corner corner-tl" /><div className="corner corner-tr" /><div className="corner corner-bl" /><div className="corner corner-br" />
        {!ready && !error && <output className="canvas-loading"><LoaderCircle className="spin" size={24} /><span>正在唤醒精灵…</span></output>}{error && <div className="canvas-error" role="alert"><Box size={28} /><strong>图形引擎未能启动</strong><p>请使用支持 WebGPU 或 WebGL 2 的浏览器，并开启硬件加速。</p><details><summary>技术详情</summary>{error}</details><button className="quiet-button" onClick={() => window.location.reload()}>重新载入</button></div>}
        <div className="viewport-left"><span className="axis-y">Y</span><div className="axis"><span className="axis-z">Z</span><span className="axis-x">X</span></div></div><div className="viewport-right"><IconButton label="放大" onClick={() => engine.current?.zoom(0.85)}><Plus /></IconButton><IconButton label="缩小" onClick={() => engine.current?.zoom(1.15)}><Minus /></IconButton><span /><IconButton label={immersive ? '退出沉浸模式 (F)' : '沉浸模式 (F)'} onClick={() => setImmersive((value) => !value)}>{immersive ? <X /> : <Expand />}</IconButton></div><div className="viewport-bottom"><span><MousePointer2 size={13} />拖动旋转 <i />滚轮缩放</span><span className="resolution">{stats.width || '—'} × {stats.height || '—'}</span></div></div>
      <div className="transport"><div className="transport-play"><button className="play-button" aria-label={settings.playing ? '暂停动画' : '播放动画'} onClick={() => change('playing', !settings.playing)}>{settings.playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</button><button className="restart-button" aria-label="重新播放" onClick={() => engine.current?.restart()}><RotateCcw size={15} /></button><span className="timecode">{String(Math.floor(stats.time / 60)).padStart(2, '0')}:{String(Math.floor(stats.time % 60)).padStart(2, '0')}<small> / LOOP</small></span></div><div className="timeline" aria-hidden="true"><div className="timeline-track"><span style={{ left: `${(stats.time % 6) / 6 * 100}%` }} /></div>{[0, 1, 2, 3, 4, 5, 6].map((n) => <span key={n}>{String(n).padStart(2, '0')}</span>)}</div><button className={`rotate-button ${settings.autoRotate ? 'on' : ''}`} aria-pressed={settings.autoRotate} onClick={() => change('autoRotate', !settings.autoRotate)}><Rotate3D size={16} /><span>自动旋转</span><span className="small-dot" /></button></div>
      <section className="presets-section" aria-label="风格预设"><div className="section-heading"><span>从一种灵感开始</span><span>04 PRESETS</span></div><div className="preset-grid">{presets.map((item, index) => <button key={item.id} className={`preset-card preset-${item.id} ${preset === item.id ? 'selected' : ''}`} onClick={() => selectPreset(item.id)} aria-pressed={preset === item.id}><div className="preset-art"><Image src={`/presets/${item.id}.png`} width={300} height={180} alt="" unoptimized /><span className="preset-index">0{index + 1}</span>{preset === item.id && <span className="preset-check"><Check size={11} /></span>}</div><div className="preset-description"><span>{item.name}</span><small>{item.subtitle}</small></div></button>)}</div></section>
    </section>
    <aside className="inspector" aria-label="参数调节"><div className="inspector-title"><div><Settings2 size={17} /><h2>调节面板</h2></div><button className="text-reset" onClick={reset}><RotateCcw size={13} />重置</button></div><Tabs value={tab} onValueChange={(value) => setTab(String(value))}><TabsList className="inspector-tabs"><TabsTrigger value="effects"><Sparkles size={14} />画面特效</TabsTrigger><TabsTrigger value="object"><Move3D size={14} />对象与动画</TabsTrigger></TabsList><div className="inspector-scroll"><TabsContent value="effects">
      <div className="control-section"><div className="control-heading"><span>01</span><h3>像素风格</h3><Grid2X2 size={14} /></div><RangeControl label="像素尺寸" name="pixelSize" suffix="px" digits={0} {...rangeProps} /><RangeControl label="抖色强度" name="dither" {...rangeProps} /><RangeControl label="色阶数量" name="colorLevels" suffix="级" digits={0} {...rangeProps} /><p className="control-note"><Square size={11} />Bayer 4 × 4 有序抖色</p></div>
      <div className="control-section"><div className="control-heading"><span>02</span><h3>光与质感</h3><Sparkles size={14} /></div><RangeControl label="辉光强度" name="bloom" {...rangeProps} /><RangeControl label="色散偏移" name="aberration" suffix="px" digits={1} {...rangeProps} /><RangeControl label="胶片颗粒" name="grain" {...rangeProps} /></div>
      <div className="control-section color-section"><div className="control-heading"><span>03</span><h3>精灵色彩</h3><span className="color-value">{settings.hue.toUpperCase()}</span></div><div className="color-swatches">{['#80eaff', '#a8ff99', '#c4a0ff', '#ffcf85', '#ff91b5'].map((color) => <button key={color} aria-label={`精灵色彩 ${color}`} aria-pressed={settings.hue === color} className={settings.hue === color ? 'chosen' : ''} style={{ backgroundColor: color }} onClick={() => change('hue', color)}>{settings.hue === color && <Check size={14} />}</button>)}<label className="custom-color" title="自定义颜色"><Plus size={15} /><input type="color" aria-label="自定义精灵色彩" value={settings.hue} onChange={(event) => change('hue', event.target.value)} /></label></div></div>
      </TabsContent><TabsContent value="object"><div className="control-section"><div className="control-heading"><span>01</span><h3>精灵形态</h3><Box size={14} /></div><RangeControl label="球体大小" name="bodySize" suffix="×" {...rangeProps} /><RangeControl label="翅膀大小" name="wingSpan" suffix="×" {...rangeProps} /><RangeControl label="漂浮粒子" name="particles" digits={0} {...rangeProps} /></div><div className="control-section"><div className="control-heading"><span>02</span><h3>运动节奏</h3><Rotate3D size={14} /></div><RangeControl label="播放速度" name="speed" suffix="×" digits={1} {...rangeProps} /><RangeControl label="振翅频率" name="flapSpeed" suffix="Hz" digits={1} {...rangeProps} /><RangeControl label="悬浮幅度" name="hover" {...rangeProps} /><Toggle label="自动旋转" checked={settings.autoRotate} onChange={(value) => change('autoRotate', value)} /></div><div className="control-section"><div className="control-heading"><span>03</span><h3>观察角度</h3><Focus size={14} /></div><div className="view-buttons"><button onClick={() => engine.current?.setView('front')}>正面</button><button onClick={() => engine.current?.setView('side')}>侧面</button><button onClick={() => engine.current?.resetCamera()}>归位</button></div></div></TabsContent><div className="preview-options"><Toggle label="显示辅助网格" checked={settings.grid} onChange={(value) => change('grid', value)} /><Toggle label="查看原始 3D" checked={settings.smooth} onChange={(value) => change('smooth', value)} /></div></div></Tabs><div className="inspector-footer"><div className="mini-spark"><Sparkles size={18} /></div><div><strong>{currentPreset.name}</strong><span>所有参数均实时生效</span></div><span className="live-dot" /></div></aside>
    <footer className="statusbar"><div><span className={`status-dot ${ready && !error ? 'connected' : ''}`} /><span>{error ? '渲染异常' : ready ? `${stats.backend} 已连接` : '正在连接渲染引擎'}</span><span className="status-divider" /><span>{stats.fps || '—'} FPS</span></div><span className="status-center">让想象，以像素的方式发光。</span><button onClick={() => setHelp(true)}><span>快捷键</span><kbd>?</kbd></button></footer>
    <Dialog open={reference} onOpenChange={setReference}><DialogContent className="reference-dialog"><DialogTitle>参考画面</DialogTitle><DialogDescription>来自 ref.mp4：蓝色光球、半透明翅膀，以及颗粒化的光晕。</DialogDescription><Image src="/reference.jpg" width={760} height={630} alt="参考视频中的蓝色发光精灵，具有两对半透明翅膀" unoptimized /><p className="reference-caption">当前场景以程序化 3D 几何与实时特效重建，无需外部模型。</p></DialogContent></Dialog>
    <Dialog open={help} onOpenChange={setHelp}><DialogContent className="help-dialog"><DialogTitle>让精灵动起来</DialogTitle><DialogDescription>直接在画面中操作，或使用右侧面板调整效果。</DialogDescription><div className="shortcut-list">{[['鼠标拖动 / 单指滑动', '旋转视角'], ['滚轮 / 双指缩放', '放大与缩小'], ['Space', '播放 / 暂停'], ['R', '重置视角'], ['F', '沉浸模式'], ['Esc', '退出沉浸模式']].map(([key, desc]) => <div key={key}><kbd>{key}</kbd><span>{desc}</span></div>)}</div></DialogContent></Dialog>
    {toast && <output className="toast"><Check size={15} />{toast}</output>}
  </main></TooltipProvider>;
}
