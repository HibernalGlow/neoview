# NeoView 阅读体验提升分析报告 —— 图像裁剪系统

> 基于 NeeView (C#/WPF) & OpenComic (Electron) 对比分析

## 一、参考来源

### NeeView — ImageTrimConfig.cs

NeeView 的图像裁剪方案（`Config/ImageTrimConfig.cs`）：
- `IsEnabled` — 总开关
- 四个方向独立百分比裁剪：`Top / Bottom / Left / Right`（0.0 ~ 0.9）
- **互斥约束**：对向之和不超过 0.9（`Left + Right ≤ 0.9`, `Top + Bottom ≤ 0.9`），修改一侧自动压缩对侧
- 最终通过 WPF 的 `CroppedBitmap` 或 `Clip` 属性在渲染层应用
- 配合「ToggleTrim」命令可快速开关

### OpenComic — readingImageClip

OpenComic 的裁剪方案（`scripts/reading.js` + `scripts/storage.js`）：
- 默认配置 `{ top: 0, bottom: 0, left: 0, right: 0 }`（百分比 0-100）
- `calculateImagesDataWithClip()` — 重算裁剪后的图片有效尺寸，用于布局计算
- 布局时生成 CSS clip 值并应用到图片容器
- **水平/垂直联动设置**：可同时设置左右或上下
- 电子书模式下自动禁用裁剪
- **per-book 独立配置** — 每本书记忆各自裁剪设置

## 二、NeoView 现状

当前的裁剪能力仅限于 **页面分割（splitHalf）**：
- `getClipPath('left')` → `inset(0 50% 0 0)` — 裁掉右半
- `getClipPath('right')` → `inset(0 0 0 50%)` — 裁掉左半
- 新 CropRect 系统通过 `getClipPathFromCropRect()` 支持归一化裁剪区域
- **缺失**：用户可配置的四边裁剪、去黑边/白边、自动裁剪

## 三、实现方案设计

### 3.1 数据模型

```typescript
interface ImageTrimSettings {
  enabled: boolean;         // 总开关
  top: number;              // 上裁剪 0-45%（对向之和 ≤ 90%）
  bottom: number;           // 下裁剪 0-45%
  left: number;             // 左裁剪 0-45%
  right: number;            // 右裁剪 0-45%
  autoTrim: boolean;        // 自动裁剪开关
  autoTrimThreshold: number;// 自动裁剪边缘颜色容差 0-255（默认 30）
  autoTrimTarget: 'black' | 'white' | 'auto'; // 裁剪目标颜色
}
```

### 3.2 渲染管线集成

```
FrameImage.svelte
  ├── 订阅 imageTrimStore → trimSettings
  ├── $derived trimClipPath = computeTrimClipPath(trimSettings)
  ├── $derived effectiveClipPath = mergeTrimAndSplit(trimClipPath, splitClipPath)
  └── <img> 元素:
      ├── style:clip-path={effectiveClipPath}  ← 合并后的裁剪
      ├── style:filter={filterCss}             ← 颜色滤镜
      └── style:transform={transform}          ← 变换
```

### 3.3 自动裁剪

通过 Canvas 采样检测图片边缘颜色，计算最佳裁剪范围：
1. 加载图片到离屏 Canvas
2. 从四边向内扫描，判断像素是否为「边框色」
3. 返回 { top, right, bottom, left } 裁剪百分比
4. 缓存结果，避免重复计算

### 3.4 UI — ImageTrimCard

新增 `ImageTrimCard.svelte`，放在 `control` 面板下（与 ColorFilterCard/PageTransitionCard 并列）：
- 总开关
- 四方向滑块（0-45%）+ 锁定联动选项
- 自动裁剪按钮 + 目标颜色 + 容差
- 预设快捷按钮（去黑边 / 去白边 / 重置）

## 四、实现优先级

| Priority | Item | Status |
|----------|------|--------|
| P0 | imageTrimStore + 持久化 | ✅ 本次实现 |
| P0 | CSS inset 渲染集成 | ✅ 本次实现 |
| P0 | ImageTrimCard UI | ✅ 本次实现 |
| P1 | 自动裁剪（Canvas 检测） | ✅ 本次实现 |
| P2 | per-book 裁剪记忆 | 后续 |
| P2 | Rust 侧自动裁剪（更高性能） | 后续 |
