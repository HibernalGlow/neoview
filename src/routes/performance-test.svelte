<script lang="ts">
  import { onMount } from 'svelte';
  import { PerformanceMonitor, getMemoryUsage, getAdaptivePerformanceConfig } from '$lib/utils/performance';
  import { Button } from '$lib/components/ui/button';

  // 仅在开发模式下启用
  if (!import.meta.env.DEV) {
    throw new Error('Performance test route is only available in development mode');
  }

  let monitor = PerformanceMonitor.getInstance();
  let metrics = $state<any>({});
  let memoryUsage = $state<any>(null);
  let config = $state<any>(null);
  let testRunning = $state(false);
  let testResults = $state<any[]>([]);

  onMount(() => {
    updateMetrics();
    config = getAdaptivePerformanceConfig();
    
    // 定期更新指标
    const interval = setInterval(updateMetrics, 1000);
    return () => clearInterval(interval);
  });

  function updateMetrics() {
    metrics = monitor.getAllMetrics();
    memoryUsage = getMemoryUsage();
  }

  async function runPerformanceTest() {
    testRunning = true;
    testResults = [];

    // 测试1: 大量数据渲染性能
    console.log('🧪 开始性能测试...');
    
    // 生成大量测试数据
    const generateData = () => {
      return monitor.measure('generate_large_dataset', () => {
        const items = [];
        for (let i = 0; i < 10000; i++) {
          items.push({
            name: `Test File ${i}`,
            path: `/test/path/file_${i}.jpg`,
            is_dir: i % 10 === 0,
            isImage: i % 10 !== 0,
            size: Math.random() * 1000000,
            modified: Date.now() - Math.random() * 86400000
          });
        }
        return items;
      });
    };

    // 测试2: 虚拟滚动性能
    const testVirtualScroll = async (items: any[]) => {
      return await monitor.measureAsync('virtual_scroll_test', async () => {
        // 模拟虚拟滚动计算
        for (let i = 0; i < 100; i++) {
          const startIndex = Math.floor(Math.random() * items.length);
          const endIndex = Math.min(startIndex + 50, items.length);
          const visibleItems = items.slice(startIndex, endIndex);
          
          // 模拟渲染延迟
          await new Promise(resolve => setTimeout(resolve, 1));
        }
      });
    };

    // 测试3: 缓存性能
    const testCachePerformance = () => {
      return monitor.measure('cache_test', () => {
        const cache = new Map();
        
        // 写入缓存
        for (let i = 0; i < 1000; i++) {
          cache.set(`key_${i}`, `value_${i}`);
        }
        
        // 读取缓存
        for (let i = 0; i < 1000; i++) {
          cache.get(`key_${i}`);
        }
        
        return cache.size;
      });
    };

    try {
      // 执行测试
      const items = generateData();
      testResults.push({
        name: '数据生成',
        result: `生成 ${items.length} 个项目`,
        metrics: monitor.getMetricStats('generate_large_dataset_duration')
      });

      await testVirtualScroll(items);
      testResults.push({
        name: '虚拟滚动',
        result: '100次滚动计算完成',
        metrics: monitor.getMetricStats('virtual_scroll_test_duration')
      });

      testCachePerformance();
      testResults.push({
        name: '缓存操作',
        result: '1000次读写完成',
        metrics: monitor.getMetricStats('cache_test_duration')
      });

    } catch (error) {
      console.error('测试失败:', error);
    } finally {
      testRunning = false;
      updateMetrics();
    }
  }

  function formatMetric(value: number | null): string {
    return value ? `${value.toFixed(2)}ms` : 'N/A';
  }

  function formatMemory(bytes: number): string {
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  }
</script>

<div class="p-6 max-w-4xl mx-auto">
  <h1 class="text-2xl font-bold mb-6">性能监控面板</h1>
  
  <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
    <!-- 内存使用情况 -->
    <div class="bg-white p-4 rounded-lg shadow">
      <h2 class="text-lg font-semibold mb-3">内存使用</h2>
      {#if memoryUsage}
        <div class="space-y-2">
          <div class="flex justify-between">
            <span>已使用:</span>
            <span class="font-mono">{memoryUsage.used}MB</span>
          </div>
          <div class="flex justify-between">
            <span>总计:</span>
            <span class="font-mono">{memoryUsage.total}MB</span>
          </div>
          <div class="flex justify-between">
            <span>限制:</span>
            <span class="font-mono">{memoryUsage.limit}MB</span>
          </div>
          <div class="w-full bg-gray-200 rounded-full h-2">
            <div 
              class="bg-blue-600 h-2 rounded-full" 
              style="width: {(memoryUsage.used / memoryUsage.limit * 100).toFixed(1)}%"
            ></div>
          </div>
        </div>
      {:else}
        <p class="text-gray-500">内存信息不可用</p>
      {/if}
    </div>

    <!-- 性能配置 -->
    <div class="bg-white p-4 rounded-lg shadow">
      <h2 class="text-lg font-semibold mb-3">自适应配置</h2>
      {#if config}
        <div class="space-y-2 text-sm">
          <div>
            <span class="font-medium">虚拟滚动:</span>
            <ul class="ml-4 mt-1">
              <li>预渲染: {config.virtualScroll.overscan} 项</li>
              <li>节流延迟: {config.virtualScroll.throttleDelay}ms</li>
              <li>批次大小: {config.virtualScroll.batchSize}</li>
            </ul>
          </div>
          <div>
            <span class="font-medium">缩略图队列:</span>
            <ul class="ml-4 mt-1">
              <li>本地并发: {config.thumbnailQueue.maxConcurrentLocal}</li>
              <li>压缩包并发: {config.thumbnailQueue.maxConcurrentArchive}</li>
            </ul>
          </div>
        </div>
      {:else}
        <p class="text-gray-500">配置信息不可用</p>
      {/if}
    </div>
  </div>

  <!-- 性能指标 -->
  <div class="bg-white p-4 rounded-lg shadow mb-6">
    <h2 class="text-lg font-semibold mb-3">性能指标</h2>
    <div class="overflow-x-auto">
      <table class="min-w-full text-sm">
        <thead>
          <tr class="border-b">
            <th class="text-left py-2">指标</th>
            <th class="text-right py-2">平均</th>
            <th class="text-right py-2">最小</th>
            <th class="text-right py-2">最大</th>
            <th class="text-right py-2">P95</th>
            <th class="text-right py-2">次数</th>
          </tr>
        </thead>
        <tbody>
          {#each Object.entries(metrics) as [name, stats]}
            {#if stats}
              <tr class="border-b">
                <td class="py-2">{name}</td>
                <td class="text-right">{formatMetric(stats.avg)}</td>
                <td class="text-right">{formatMetric(stats.min)}</td>
                <td class="text-right">{formatMetric(stats.max)}</td>
                <td class="text-right">{formatMetric(stats.p95)}</td>
                <td class="text-right">{stats.count}</td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    </div>
  </div>

  <!-- 性能测试 -->
  <div class="bg-white p-4 rounded-lg shadow mb-6">
    <div class="flex justify-between items-center mb-3">
      <h2 class="text-lg font-semibold">性能测试</h2>
      <Button 
        onclick={runPerformanceTest} 
        disabled={testRunning}
        class="px-4 py-2"
      >
        {testRunning ? '测试中...' : '运行测试'}
      </Button>
    </div>
    
    {#if testResults.length > 0}
      <div class="space-y-3">
        {#each testResults as result}
          <div class="border rounded p-3">
            <h3 class="font-medium">{result.name}</h3>
            <p class="text-sm text-gray-600 mb-2">{result.result}</p>
            {#if result.metrics}
              <div class="text-xs text-gray-500">
                平均: {formatMetric(result.metrics.avg)} | 
                最小: {formatMetric(result.metrics.min)} | 
                最大: {formatMetric(result.metrics.max)} | 
                P95: {formatMetric(result.metrics.p95)}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- 优化建议 -->
  <div class="bg-white p-4 rounded-lg shadow">
    <h2 class="text-lg font-semibold mb-3">优化建议</h2>
    <div class="space-y-2 text-sm">
      {#if memoryUsage && memoryUsage.used / memoryUsage.limit > 0.8}
        <div class="p-3 bg-yellow-50 border border-yellow-200 rounded">
          ⚠️ 内存使用率较高 ({(memoryUsage.used / memoryUsage.limit * 100).toFixed(1)}%)，建议清理缓存
        </div>
      {/if}
      
      {#if config && config.virtualScroll.overscan < 5}
        <div class="p-3 bg-blue-50 border border-blue-200 rounded">
          💡 检测到低性能设备，已自动优化虚拟滚动参数
        </div>
      {/if}
      
      <div class="p-3 bg-green-50 border border-green-200 rounded">
        ✅ 虚拟滚动和多优先级队列已启用，可提升大目录浏览性能
      </div>
    </div>
  </div>
</div>