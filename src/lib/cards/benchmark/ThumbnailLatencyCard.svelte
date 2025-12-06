<script lang="ts">
/**
 * 缩略图加载延迟测试卡片
 * 测试从前端发起请求到收到结果的全链路延迟
 */
import { invoke } from '@tauri-apps/api/core';
import { Activity, Play, RefreshCw, Folder } from '@lucide/svelte';
import { Button } from '$lib/components/ui/button';
import { batchLoadDirectorySnapshots } from '$lib/api/filesystem';

interface LatencyRecord {
  id: number;
  path: string;
  type: 'single' | 'batch';
  cached: boolean;
  backendMs: number;
  totalMs: number;
  itemCount: number;
  error?: string;
}

let records = $state<LatencyRecord[]>([]);
let isRunning = $state(false);
let testPaths = $state<string[]>([]);
let recordId = $state(0);

// 统计数据
let stats = $derived(() => {
  if (records.length === 0) return { avgTotal: 0, avgBackend: 0, cacheHitRate: 0, count: 0 };
  const successRecords = records.filter(r => !r.error);
  const cachedCount = successRecords.filter(r => r.cached).length;
  return {
    avgTotal: successRecords.reduce((sum, r) => sum + r.totalMs, 0) / successRecords.length || 0,
    avgBackend: successRecords.reduce((sum, r) => sum + r.backendMs, 0) / successRecords.length || 0,
    cacheHitRate: (cachedCount / successRecords.length) * 100 || 0,
    count: records.length,
  };
});

async function selectTestDirectory() {
  try {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({ directory: true, multiple: false });
    if (selected) {
      // 获取目录下的子目录（后端返回 camelCase: isDir）
      const snapshot = await invoke<{ items: Array<{ path: string; isDir: boolean }> }>(
        'load_directory_snapshot',
        { path: selected }
      );
      console.log('📁 目录内容:', snapshot.items.slice(0, 5));
      testPaths = snapshot.items
        .filter(item => item.isDir === true)
        .slice(0, 20)
        .map(item => item.path);
      console.log(`📁 选择了 ${testPaths.length} 个子目录用于测试`);
      
      // 如果没有子目录，提示用户
      if (testPaths.length === 0) {
        console.warn('⚠️ 所选目录没有子目录，请选择包含子目录的文件夹');
      }
    }
  } catch (e) {
    console.error('选择目录失败:', e);
  }
}

async function runSingleTest() {
  if (testPaths.length === 0) {
    console.warn('请先选择测试目录');
    return;
  }
  
  isRunning = true;
  
  for (const path of testPaths) {
    const startTime = performance.now();
    try {
      const result = await invoke<{ items: Array<unknown>; mtime?: number; cached: boolean }>(
        'load_directory_snapshot',
        { path }
      );
      const totalMs = performance.now() - startTime;
      
      records = [{
        id: ++recordId,
        path: path.split('\\').pop() || path,
        type: 'single',
        cached: result.cached,
        backendMs: totalMs, // 单次调用无法区分后端时间
        totalMs,
        itemCount: result.items.length,
      }, ...records.slice(0, 99)];
    } catch (e) {
      const totalMs = performance.now() - startTime;
      records = [{
        id: ++recordId,
        path: path.split('\\').pop() || path,
        type: 'single',
        cached: false,
        backendMs: 0,
        totalMs,
        itemCount: 0,
        error: String(e),
      }, ...records.slice(0, 99)];
    }
  }
  
  isRunning = false;
}

async function runBatchTest() {
  if (testPaths.length === 0) {
    console.warn('请先选择测试目录');
    return;
  }
  
  isRunning = true;
  const startTime = performance.now();
  
  try {
    const results = await batchLoadDirectorySnapshots(testPaths);
    const totalMs = performance.now() - startTime;
    const avgMs = totalMs / results.length;
    
    for (const result of results) {
      records = [{
        id: ++recordId,
        path: result.path.split('\\').pop() || result.path,
        type: 'batch',
        cached: result.snapshot?.cached ?? false,
        backendMs: avgMs,
        totalMs: avgMs,
        itemCount: result.snapshot?.items.length ?? 0,
        error: result.error ?? undefined,
      }, ...records.slice(0, 99)];
    }
    
    console.log(`⚡ 批量加载完成: ${results.length} 目录, 总耗时 ${totalMs.toFixed(0)}ms, 平均 ${avgMs.toFixed(1)}ms`);
  } catch (e) {
    console.error('批量加载失败:', e);
  }
  
  isRunning = false;
}

function clearRecords() {
  records = [];
  recordId = 0;
}

function formatMs(ms: number): string {
  if (ms < 1) return '<1ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}
</script>

<div class="space-y-3">
  <!-- 控制按钮 -->
  <div class="flex flex-wrap gap-2">
    <Button variant="outline" size="sm" onclick={selectTestDirectory}>
      <Folder class="w-4 h-4 mr-1" />
      选择目录
    </Button>
    <Button 
      variant="default" 
      size="sm"
      onclick={runSingleTest}
      disabled={isRunning || testPaths.length === 0}
    >
      <Play class="w-4 h-4 mr-1" />
      串行测试
    </Button>
    <Button 
      variant="default" 
      size="sm"
      onclick={runBatchTest}
      disabled={isRunning || testPaths.length === 0}
    >
      <Activity class="w-4 h-4 mr-1" />
      并发测试
    </Button>
    <Button variant="ghost" size="sm" onclick={clearRecords}>
      <RefreshCw class="w-4 h-4 mr-1" />
      清空
    </Button>
  </div>
  
  <!-- 测试路径提示 -->
  {#if testPaths.length > 0}
    <div class="text-xs text-muted-foreground">
      已选择 {testPaths.length} 个子目录
    </div>
  {:else}
    <div class="text-xs text-muted-foreground">
      点击"选择目录"选择包含子目录的文件夹
    </div>
  {/if}
  
  <!-- 统计摘要 -->
  {#if stats().count > 0}
    <div class="grid grid-cols-4 gap-2 text-sm">
      <div class="bg-muted/50 rounded p-2 text-center">
        <div class="text-muted-foreground text-xs">平均耗时</div>
        <div class="font-mono font-bold">{formatMs(stats().avgTotal)}</div>
      </div>
      <div class="bg-muted/50 rounded p-2 text-center">
        <div class="text-muted-foreground text-xs">缓存命中</div>
        <div class="font-mono font-bold">{stats().cacheHitRate.toFixed(0)}%</div>
      </div>
      <div class="bg-muted/50 rounded p-2 text-center">
        <div class="text-muted-foreground text-xs">采样数</div>
        <div class="font-mono font-bold">{stats().count}</div>
      </div>
      <div class="bg-muted/50 rounded p-2 text-center">
        <div class="text-muted-foreground text-xs">状态</div>
        <div class="font-mono font-bold text-xs">{isRunning ? '运行中' : '空闲'}</div>
      </div>
    </div>
  {/if}
  
  <!-- 延迟记录列表 -->
  <div class="max-h-64 overflow-auto">
    {#if records.length === 0}
      <div class="text-center text-muted-foreground py-4">
        选择目录后点击测试按钮
      </div>
    {:else}
      <!-- 表头 -->
      <div class="flex items-center gap-2 text-[10px] text-muted-foreground px-2 py-1 border-b mb-1">
        <span class="w-24 truncate">目录</span>
        <span class="w-12">类型</span>
        <span class="w-16">耗时</span>
        <span class="w-12">项数</span>
        <span class="flex-1">状态</span>
      </div>
      <div class="space-y-0.5">
        {#each records as record (record.id)}
          <div class="flex items-center gap-2 text-xs rounded px-2 py-1 {record.error ? 'bg-red-500/10' : record.cached ? 'bg-green-500/10' : 'bg-muted/30'}">
            <span class="w-24 truncate text-muted-foreground" title={record.path}>
              {record.path}
            </span>
            <span class="w-12 {record.type === 'batch' ? 'text-blue-500' : 'text-orange-500'}">
              {record.type === 'batch' ? '并发' : '串行'}
            </span>
            <span class="w-16 font-mono"
              class:text-green-500={record.totalMs < 50}
              class:text-yellow-500={record.totalMs >= 50 && record.totalMs < 200}
              class:text-red-500={record.totalMs >= 200}
            >
              {formatMs(record.totalMs)}
            </span>
            <span class="w-12 text-muted-foreground">{record.itemCount}</span>
            <span class="flex-1">
              {#if record.error}
                <span class="text-red-500 text-[10px]">错误</span>
              {:else if record.cached}
                <span class="text-green-500 text-[10px]">缓存</span>
              {:else}
                <span class="text-blue-500 text-[10px]">加载</span>
              {/if}
            </span>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
