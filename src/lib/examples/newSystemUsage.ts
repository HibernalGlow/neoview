/**
 * 新系统使用示例
 * 
 * 展示如何使用新的 NeeView 风格页面系统
 */

import { bookStore2 } from '../stores/bookStore2';
import { openBookWithTauri } from '../core/tauriIntegration';
import type { VirtualPage } from '../core/types';

// ============================================================================
// 基础用法
// ============================================================================

/**
 * 示例 1: 打开一个压缩包
 */
export async function example1_openArchive() {
  const archivePath = 'D:/Comics/manga.zip';
  
  try {
    await openBookWithTauri(bookStore2, archivePath);
    console.log('Book opened successfully');
  } catch (error) {
    console.error('Failed to open book:', error);
  }
}

/**
 * 示例 2: 打开一个文件夹
 */
export async function example2_openFolder() {
  const folderPath = 'D:/Comics/manga_folder';
  
  try {
    await openBookWithTauri(bookStore2, folderPath);
    console.log('Folder opened successfully');
  } catch (error) {
    console.error('Failed to open folder:', error);
  }
}

/**
 * 示例 3: 带超分功能打开
 */
export async function example3_openWithUpscale() {
  const archivePath = 'D:/Comics/manga.zip';
  
  try {
    await openBookWithTauri(bookStore2, archivePath, {
      enableUpscale: true,
      upscaleModel: 'realesrgan-x4plus-anime',
      upscaleScale: 2,
    });
    console.log('Book opened with upscale enabled');
  } catch (error) {
    console.error('Failed to open book:', error);
  }
}

// ============================================================================
// 页面导航
// ============================================================================

/**
 * 示例 4: 页面导航
 */
export function example4_navigation() {
  // 下一页
  const hasNext = bookStore2.nextPage();
  console.log('Has next page:', hasNext);
  
  // 上一页
  const hasPrev = bookStore2.prevPage();
  console.log('Has prev page:', hasPrev);
  
  // 跳转到指定页
  bookStore2.goToPage(10);
  
  // 跳转到首页
  bookStore2.goToFirst();
  
  // 跳转到末页
  bookStore2.goToLast();
  
  // 下一个文件夹
  bookStore2.nextFolder();
  
  // 上一个文件夹
  bookStore2.prevFolder();
}

// ============================================================================
// 设置
// ============================================================================

/**
 * 示例 5: 页面设置
 */
export function example5_settings() {
  // 启用分割横向页面
  bookStore2.setDivideLandscape(true);
  
  // 设置双页模式
  bookStore2.setPageMode('wide');
  
  // 设置阅读方向 (从右到左)
  bookStore2.setReadOrder('rtl');
  
  // 设置排序方式
  bookStore2.setSortMode('fileName');
}

// ============================================================================
// 视图控制
// ============================================================================

/**
 * 示例 6: 视图控制
 */
export function example6_viewControl() {
  // 设置容器尺寸
  bookStore2.setContainerSize(1920, 1080);
  
  // 缩放
  bookStore2.zoom(1); // 放大
  bookStore2.zoom(-1); // 缩小
  bookStore2.zoomTo(1.5); // 缩放到 150%
  bookStore2.resetZoom(); // 重置缩放
  
  // 平移
  bookStore2.pan(100, 50); // 向右下平移
  
  // 旋转
  bookStore2.rotate(90); // 旋转 90 度
  bookStore2.resetRotation(); // 重置旋转
  
  // 适应容器
  bookStore2.fitToContainer();
  
  // 视图模式
  bookStore2.setViewMode('normal'); // 普通模式
  bookStore2.setViewMode('panorama'); // 全景模式
  bookStore2.setViewMode('loupe'); // 放大镜模式
  
  // 全景滚动
  bookStore2.panoramaScroll(100);
  
  // 放大镜移动
  bookStore2.loupeMove(500, 300);
}

// ============================================================================
// 拖拽
// ============================================================================

/**
 * 示例 7: 拖拽操作
 */
export function example7_drag() {
  // 开始拖拽
  bookStore2.startDrag(100, 100);
  
  // 拖拽中
  bookStore2.drag(200, 150);
  
  // 结束拖拽
  bookStore2.endDrag();
}

// ============================================================================
// 数据访问
// ============================================================================

/**
 * 示例 8: 数据访问
 */
export function example8_dataAccess() {
  // 获取虚拟页面
  const page = bookStore2.getVirtualPage(0);
  if (page) {
    console.log('Page info:', {
      virtualIndex: page.virtualIndex,
      physicalIndex: page.physicalPage.index,
      isDivided: page.isDivided,
      part: page.part,
    });
  }
  
  // 获取物理页面
  const physicalPage = bookStore2.getPhysicalPage(0);
  if (physicalPage) {
    console.log('Physical page:', {
      path: physicalPage.path,
      size: physicalPage.size,
      aspectRatio: physicalPage.aspectRatio,
    });
  }
  
  // 获取所有虚拟页面
  const allPages = bookStore2.getAllVirtualPages();
  console.log('Total virtual pages:', allPages.length);
  
  // 获取范围内的页面
  const rangePages = bookStore2.getVirtualPagesInRange(0, 10);
  console.log('Pages in range:', rangePages.length);
}

// ============================================================================
// 缓存访问
// ============================================================================

/**
 * 示例 9: 缓存访问
 */
export async function example9_cacheAccess() {
  // 获取图像缓存
  const imageBlob = bookStore2.getImageCache(0);
  if (imageBlob) {
    console.log('Image cached, size:', imageBlob.size);
  }
  
  // 获取缩略图缓存
  const thumbBlob = bookStore2.getThumbnailCache(0);
  if (thumbBlob) {
    console.log('Thumbnail cached, size:', thumbBlob.size);
  }
  
  // 请求加载图像 (如果没有缓存会触发加载)
  const loadedImage = await bookStore2.requestImage(0);
  if (loadedImage) {
    console.log('Image loaded, size:', loadedImage.size);
  }
  
  // 请求加载缩略图
  const loadedThumb = await bookStore2.requestThumbnail(0);
  if (loadedThumb) {
    console.log('Thumbnail loaded, size:', loadedThumb.size);
  }
}

// ============================================================================
// 预加载控制
// ============================================================================

/**
 * 示例 10: 预加载控制
 */
export function example10_preloadControl() {
  // 暂停预加载
  bookStore2.pausePreload();
  
  // 恢复预加载
  bookStore2.resumePreload();
  
  // 清空预加载缓存
  bookStore2.clearPreloadCache();
}

// ============================================================================
// 状态订阅
// ============================================================================

/**
 * 示例 11: 状态订阅
 */
export function example11_subscription() {
  // 订阅状态变化
  const unsubscribe = bookStore2.subscribe((state) => {
    console.log('State changed:', {
      isOpen: state.isOpen,
      currentIndex: state.currentIndex,
      virtualPageCount: state.virtualPageCount,
      viewMode: state.viewState.mode,
      scale: state.viewState.scale,
    });
  });
  
  // 取消订阅
  // unsubscribe();
  
  return unsubscribe;
}

// ============================================================================
// 自定义加载函数
// ============================================================================

/**
 * 示例 12: 自定义加载函数
 */
export function example12_customLoaders() {
  // 自定义图像加载函数
  const customImageLoader = async (virtualPage: VirtualPage, signal: AbortSignal): Promise<Blob> => {
    // 检查取消
    if (signal.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    
    // 自定义加载逻辑
    const response = await fetch(`/api/images/${virtualPage.physicalPage.path}`, {
      signal,
    });
    
    return response.blob();
  };
  
  // 自定义缩略图加载函数
  const customThumbnailLoader = async (virtualPage: VirtualPage, signal: AbortSignal): Promise<Blob> => {
    if (signal.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    
    const response = await fetch(`/api/thumbnails/${virtualPage.physicalPage.path}`, {
      signal,
    });
    
    return response.blob();
  };
  
  // 自定义超分函数
  const customUpscaler = async (
    virtualPage: VirtualPage,
    imageBlob: Blob,
    signal: AbortSignal
  ): Promise<Blob> => {
    if (signal.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    
    const formData = new FormData();
    formData.append('image', imageBlob);
    formData.append('scale', '2');
    
    const response = await fetch('/api/upscale', {
      method: 'POST',
      body: formData,
      signal,
    });
    
    return response.blob();
  };
  
  // 设置自定义加载函数
  bookStore2.setLoadFunctions(
    customImageLoader,
    customThumbnailLoader,
    customUpscaler
  );
}

// ============================================================================
// 完整使用流程
// ============================================================================

/**
 * 示例 13: 完整使用流程
 */
export async function example13_fullWorkflow() {
  // 1. 订阅状态
  const unsubscribe = bookStore2.subscribe((state) => {
    if (state.isOpen) {
      console.log(`Page ${state.currentIndex + 1} / ${state.virtualPageCount}`);
    }
  });
  
  try {
    // 2. 打开书籍
    await openBookWithTauri(bookStore2, 'D:/Comics/manga.zip');
    
    // 3. 配置设置
    bookStore2.setDivideLandscape(true);
    bookStore2.setReadOrder('rtl');
    
    // 4. 浏览页面
    for (let i = 0; i < 5; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      bookStore2.nextPage();
    }
    
    // 5. 关闭书籍
    bookStore2.closeBook();
    
  } finally {
    // 6. 清理
    unsubscribe();
    bookStore2.destroy();
  }
}
