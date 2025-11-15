/**
 * 性能优化测试套件
 */

import { PerformanceMonitor } from '$lib/utils/performance';

export function runPerformanceOptimizationTests() {
  const monitor = PerformanceMonitor.getInstance();
  console.log('🧪 开始性能优化测试...');

  // 测试1: 虚拟滚动性能
  testVirtualScrollPerformance(monitor);

  // 测试2: 缓存性能
  testCachePerformance(monitor);

  // 测试3: 队列性能
  testQueuePerformance(monitor);

  // 输出测试结果
  setTimeout(() => {
    const metrics = monitor.getAllMetrics();
    console.log('📊 测试结果:', metrics);
  }, 1000);
}

function testVirtualScrollPerformance(monitor: PerformanceMonitor) {
  console.log('🔄 测试虚拟滚动性能...');
  
  // 模拟大量数据
  const largeDataset = Array.from({ length: 10000 }, (_, i) => ({
    id: i,
    name: `File ${i}`,
    path: `/path/to/file_${i}.jpg`
  }));

  // 测试虚拟滚动计算
  const duration = monitor.measure('virtual_scroll_calculation', () => {
    for (let i = 0; i < 100; i++) {
      const startIndex = Math.floor(Math.random() * largeDataset.length);
      const endIndex = Math.min(startIndex + 50, largeDataset.length);
      const visibleItems = largeDataset.slice(startIndex, endIndex);
      
      // 模拟DOM操作
      visibleItems.forEach(item => {
        document.createElement('div').textContent = item.name;
      });
    }
  });

  console.log(`✅ 虚拟滚动测试完成: ${duration.toFixed(2)}ms`);
}

function testCachePerformance(monitor: PerformanceMonitor) {
  console.log('💾 测试缓存性能...');
  
  const cache = new Map();
  
  const duration = monitor.measure('cache_operations', () => {
    // 写入缓存
    for (let i = 0; i < 1000; i++) {
      cache.set(`key_${i}`, {
        name: `Item ${i}`,
        data: new Array(100).fill(0).map(() => Math.random())
      });
    }
    
    // 读取缓存
    for (let i = 0; i < 1000; i++) {
      cache.get(`key_${i}`);
    }
    
    // 删除部分缓存
    for (let i = 0; i < 100; i++) {
      cache.delete(`key_${i}`);
    }
  });

  console.log(`✅ 缓存测试完成: ${duration.toFixed(2)}ms`);
}

function testQueuePerformance(monitor: PerformanceMonitor) {
  console.log('⚡ 测试队列性能...');
  
  const queue = {
    immediate: [] as any[],
    high: [] as any[],
    normal: [] as any[]
  };

  const duration = monitor.measure('queue_operations', () => {
    // 入队操作
    for (let i = 0; i < 1000; i++) {
      const priority = i % 3 === 0 ? 'immediate' : i % 3 === 1 ? 'high' : 'normal';
      queue[priority].push({ id: i, data: `Task ${i}` });
    }
    
    // 出队操作（按优先级）
    const processed = [];
    while (queue.immediate.length > 0) {
      processed.push(queue.immediate.shift());
    }
    while (queue.high.length > 0) {
      processed.push(queue.high.shift());
    }
    while (queue.normal.length > 0) {
      processed.push(queue.normal.shift());
    }
  });

  console.log(`✅ 队列测试完成: ${duration.toFixed(2)}ms`);
}

// 导出测试函数供控制台使用
if (typeof window !== 'undefined') {
  (window as any).runPerformanceTests = runPerformanceOptimizationTests;
}