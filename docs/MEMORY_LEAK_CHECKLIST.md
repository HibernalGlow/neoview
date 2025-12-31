# 内存泄露检查清单

## 已修复的问题 ✅

### 1. CurrentFrameLayer.svelte - setTimeout 泄露（严重）
- **问题**: 每次翻页动画都创建 setTimeout，快速翻页时旧定时器没被清除
- **修复**: 保存定时器引用，新动画开始时清除旧定时器，组件销毁时也清除
- **文件**: `src/lib/stackview/layers/CurrentFrameLayer.svelte`

### 2. CurrentFrameLayer.svelte - Store 订阅泄露（中等）
- **问题**: pageTransitionStore 订阅后没有在 onDestroy 中取消
- **修复**: 添加 onDestroy 钩子，正确清理订阅
- **文件**: `src/lib/stackview/layers/CurrentFrameLayer.svelte`

### 3. CSS will-change 滥用（中等）
- **问题**: 持续使用 will-change 导致每张图片都分配独立 GPU 图层
- **修复**: 移除持久的 will-change，仅保留 translateZ(0)
- **文件**: 
  - `src/lib/stackview/layers/CurrentFrameLayer.svelte`
  - `src/lib/stackview/components/FrameImage.svelte`
  - `src/lib/stackview/components/CanvasImage.svelte`

## 已验证正确的组件 ✅

### HoverLayer.svelte
- ✅ rafId 在 onDestroy 中正确清理: `cancelAnimationFrame(rafId)`
- ✅ mutationTimeout 在 onDestroy 中清理
- ✅ MutationObserver 和 ResizeObserver 正确 disconnect

### HoverScrollLayer.svelte
- ✅ rafId 在 onDestroy 中正确清理
- ✅ initTimeout 和 mutationTimeout 都在 onDestroy 中清理
- ✅ MutationObserver 和 ResizeObserver 正确 disconnect
- ✅ 事件监听器在 onDestroy 中移除

### LayerTreeView.svelte
- ✅ intervalId 在 onDestroy 中清理: `clearInterval(intervalId)`

### slideshow.svelte.ts
- ✅ timer 和 tickInterval 在 stopTimer 中正确清理
- ✅ destroy 方法正确实现

### gistSync.svelte.ts
- ✅ _syncTimer 在 stopAutoSync 中清理

### autoBackup.svelte.ts
- ✅ timer 在 stopScheduler 中清理

### imageDecoderManager.ts
- ✅ Worker 池有 destroy 方法
- ✅ Worker 是单例，正常不需要销毁（除非关闭应用）

## 潜在问题区域（需要进一步检查）

### 1. PageFlipMonitorCard.svelte - setInterval 可能泄露
**位置**: `src/lib/cards/benchmark/PageFlipMonitorCard.svelte`
**问题**: 
```typescript
if (typeof window !== 'undefined') {
	updateInterval = setInterval(updateStats, 1000);
}
```
没有在组件销毁时清理 setInterval

**建议修复**: 添加 onDestroy 清理

### 2. 事件监听器可能的泄露
**需要检查的模式**:
```typescript
window.addEventListener('xxx', handler)
document.addEventListener('xxx', handler)
```
确保在 onDestroy 中移除

### 3. $effect 清理
Svelte 5 的 $effect 会自动清理，但如果在 effect 中创建了外部资源（如定时器、监听器），需要返回清理函数：

```typescript
$effect(() => {
  const timer = setInterval(...);
  return () => clearInterval(timer); // 必须返回清理函数
});
```

## 检查命令

### 查找所有 setInterval/setTimeout
```bash
grep -r "setInterval\|setTimeout" src/lib --include="*.ts" --include="*.svelte"
```

### 查找所有 addEventListener
```bash
grep -r "addEventListener" src/lib --include="*.ts" --include="*.svelte"
```

### 查找所有 requestAnimationFrame
```bash
grep -r "requestAnimationFrame" src/lib --include="*.ts" --include="*.svelte"
```

### 查找所有 new Worker
```bash
grep -r "new Worker" src/lib --include="*.ts"
```

### 查找 onDestroy 缺失
```bash
# 查找有 setInterval 但没有 onDestroy 的文件
grep -l "setInterval" src/lib/**/*.svelte | while read file; do
  if ! grep -q "onDestroy" "$file"; then
    echo "Missing onDestroy: $file"
  fi
done
```

## 性能监控建议

### 使用 Chrome DevTools
1. **Performance Monitor**:
   - JS Heap Size - 应保持稳定
   - DOM Nodes - 不应持续增长
   - JS Event Listeners - 不应持续增长

2. **Memory Profiler**:
   - 翻页前拍快照
   - 翻页 100 次
   - 再次拍快照
   - 比较两个快照，查找 "Detached" 节点

3. **Performance Recording**:
   - 记录翻页操作
   - 查看 Scripting 时间是否增长
   - 查看 Rendering 时间是否增长

### 使用自带的监控
- PageFlipMonitorCard（在 Benchmark 面板）
- 观察指标应该保持稳定：
  - 平均耗时 < 100ms
  - 内存不会持续增长
  - 活跃定时器 < 10 个

## 最佳实践

### 1. 始终清理定时器
```typescript
let timer: ReturnType<typeof setTimeout> | null = null;

onMount(() => {
  timer = setTimeout(...);
});

onDestroy(() => {
  if (timer) clearTimeout(timer);
});
```

### 2. 始终清理事件监听器
```typescript
function handler() { ... }

onMount(() => {
  window.addEventListener('event', handler);
});

onDestroy(() => {
  window.removeEventListener('event', handler);
});
```

### 3. 使用 $effect 返回清理函数
```typescript
$effect(() => {
  const subscription = store.subscribe(...);
  return () => subscription(); // 清理订阅
});
```

### 4. 避免持久的 will-change
```css
/* ❌ 不好 - 持续占用 GPU 图层 */
.element {
  will-change: transform;
}

/* ✅ 好 - 仅在需要时添加 */
.element:hover {
  will-change: transform;
}

/* ✅ 或者只使用基本 GPU 加速 */
.element {
  transform: translateZ(0);
}
```

### 5. Worker 管理
```typescript
let worker: Worker | null = null;

onMount(() => {
  worker = new Worker(...);
});

onDestroy(() => {
  if (worker) {
    worker.terminate();
    worker = null;
  }
});
```

## 总结

已修复的3个关键问题应该能显著改善翻页性能：
1. ✅ setTimeout 泄露修复
2. ✅ Store 订阅泄露修复
3. ✅ will-change 优化

仍需修复的1个小问题：
- ⚠️ PageFlipMonitorCard 的 setInterval 需要添加清理

建议使用 PageFlipMonitorCard 持续监控，确保修复有效。
