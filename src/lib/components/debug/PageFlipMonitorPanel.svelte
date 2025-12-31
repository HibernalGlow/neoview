<!--
  PageFlipMonitorPanel - 翻页性能监控面板
  按下 Ctrl+Shift+M 显示/隐藏
  用于诊断内存泄露和性能问题
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { pageFlipMonitor } from '$lib/utils/pageFlipMonitor';
  
  let visible = $state(false);
  let stats = $state({
    totalFlips: 0,
    averageFlipTime: 0,
    maxFlipTime: 0,
    memoryUsageMB: null as number | null,
    activeTimers: 0,
    lastFlipTime: null as Date | null,
  });
  
  // 定时更新统计
  let updateInterval: ReturnType<typeof setInterval> | null = null;
  
  function updateStats() {
    stats = pageFlipMonitor.getStats();
  }
  
  function toggleVisibility() {
    visible = !visible;
  }
  
  function resetStats() {
    pageFlipMonitor.reset();
    updateStats();
  }
  
  function printToConsole() {
    pageFlipMonitor.printStats();
  }
  
  function handleKeyDown(e: KeyboardEvent) {
    // Ctrl+Shift+M 切换显示
    if (e.ctrlKey && e.shiftKey && e.key === 'M') {
      e.preventDefault();
      toggleVisibility();
    }
  }
  
  onMount(() => {
    window.addEventListener('keydown', handleKeyDown);
    
    // 每秒更新一次
    updateInterval = setInterval(updateStats, 1000);
    updateStats();
  });
  
  onDestroy(() => {
    window.removeEventListener('keydown', handleKeyDown);
    if (updateInterval) {
      clearInterval(updateInterval);
    }
  });
</script>

{#if visible}
  <div class="monitor-panel">
    <div class="monitor-header">
      <h3>📊 翻页性能监控</h3>
      <button class="close-btn" onclick={toggleVisibility}>×</button>
    </div>
    
    <div class="monitor-content">
      <div class="stat-row">
        <span class="label">总翻页次数:</span>
        <span class="value">{stats.totalFlips}</span>
      </div>
      
      <div class="stat-row">
        <span class="label">平均耗时:</span>
        <span class="value" class:warning={stats.averageFlipTime > 100}>
          {stats.averageFlipTime.toFixed(1)}ms
        </span>
      </div>
      
      <div class="stat-row">
        <span class="label">最大耗时:</span>
        <span class="value" class:warning={stats.maxFlipTime > 200}>
          {stats.maxFlipTime.toFixed(1)}ms
        </span>
      </div>
      
      {#if stats.memoryUsageMB !== null}
        <div class="stat-row">
          <span class="label">内存使用:</span>
          <span class="value" class:warning={stats.memoryUsageMB > 500}>
            {stats.memoryUsageMB.toFixed(1)}MB
          </span>
        </div>
      {/if}
      
      <div class="stat-row">
        <span class="label">活跃定时器:</span>
        <span class="value" class:warning={stats.activeTimers > 10}>
          {stats.activeTimers}
        </span>
      </div>
    </div>
    
    <div class="monitor-actions">
      <button onclick={resetStats}>重置</button>
      <button onclick={printToConsole}>打印到控制台</button>
    </div>
    
    <div class="monitor-hint">
      按 Ctrl+Shift+M 关闭
    </div>
  </div>
{/if}

<style>
  .monitor-panel {
    position: fixed;
    top: 20px;
    right: 20px;
    width: 320px;
    background: rgba(0, 0, 0, 0.95);
    color: #fff;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    z-index: 10000;
    font-family: 'Consolas', 'Monaco', monospace;
    font-size: 13px;
  }
  
  .monitor-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }
  
  .monitor-header h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
  }
  
  .close-btn {
    background: none;
    border: none;
    color: #fff;
    font-size: 24px;
    line-height: 1;
    cursor: pointer;
    padding: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: background 0.2s;
  }
  
  .close-btn:hover {
    background: rgba(255, 255, 255, 0.1);
  }
  
  .monitor-content {
    padding: 12px 16px;
  }
  
  .stat-row {
    display: flex;
    justify-content: space-between;
    padding: 6px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }
  
  .stat-row:last-child {
    border-bottom: none;
  }
  
  .label {
    color: #aaa;
  }
  
  .value {
    font-weight: 600;
    color: #4ade80;
  }
  
  .value.warning {
    color: #fbbf24;
  }
  
  .monitor-actions {
    display: flex;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }
  
  .monitor-actions button {
    flex: 1;
    padding: 6px 12px;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: #fff;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    transition: background 0.2s;
  }
  
  .monitor-actions button:hover {
    background: rgba(255, 255, 255, 0.2);
  }
  
  .monitor-hint {
    padding: 8px 16px;
    text-align: center;
    font-size: 11px;
    color: #666;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
  }
</style>
