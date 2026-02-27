/// <reference lib="webworker" />

/**
 * Thumbnail Worker
 * 缩略图处理 WebWorker - 将缩略图处理移到 Worker 线程，避免阻塞主线程
 */

export interface ThumbnailWorkerMessage {
  type: 'process' | 'batch-process' | 'cancel';
  id?: string;
  data?: {
    blobData: Uint8Array;
    maxWidth?: number;
    maxHeight?: number;
    quality?: number;
  };
  items?: Array<{
    id: string;
    blobData: Uint8Array;
    maxWidth?: number;
    maxHeight?: number;
    quality?: number;
  }>;
}

export interface ThumbnailWorkerResponse {
  type: 'success' | 'error' | 'progress';
  id?: string;
  dataUrl?: string;
  error?: string;
  progress?: number;
  total?: number;
}

// Worker 全局类型声明
declare const self: DedicatedWorkerGlobalScope;

/**
 * 在 Worker 中处理缩略图
 */
self.onmessage = async (e: MessageEvent<ThumbnailWorkerMessage>) => {
  const { type, id, data, items } = e.data;

  try {
    switch (type) {
      case 'process':
        if (data && id) {
          await processThumbnail(id, data);
        }
        break;

      case 'batch-process':
        if (items) {
          await processBatchThumbnails(items);
        }
        break;

      case 'cancel':
        // 取消处理（可以在这里实现取消逻辑）
        break;
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      id,
      error: error instanceof Error ? error.message : 'Unknown error',
    } as ThumbnailWorkerResponse);
  }
};

/**
 * 处理单个缩略图
 */
async function processThumbnail(
  id: string,
  data: ThumbnailWorkerMessage['data']
): Promise<void> {
  if (!data) return;

  try {
    const { blobData, maxWidth = 256, maxHeight = 256, quality = 0.85 } = data;

    // 创建 Blob 并加载为 Image
    const blob = new Blob([blobData], { type: 'image/webp' });
    const imageUrl = URL.createObjectURL(blob);

    const img = await loadImage(imageUrl);
    URL.revokeObjectURL(imageUrl);

    // 计算缩放后的尺寸
    const { width, height } = calculateThumbnailSize(
      img.width,
      img.height,
      maxWidth,
      maxHeight
    );

    // 创建 Canvas 并绘制缩略图
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }

    ctx.drawImage(img, 0, 0, width, height);

    // 转换为 Blob
    const thumbnailBlob = await canvas.convertToBlob({
      type: 'image/jpeg',
      quality,
    });

    // 转换为 Data URL
    const reader = new FileReader();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(thumbnailBlob);
    });

    // 发送结果
    self.postMessage({
      type: 'success',
      id,
      dataUrl,
    } as ThumbnailWorkerResponse);
  } catch (error) {
    self.postMessage({
      type: 'error',
      id,
      error: error instanceof Error ? error.message : 'Processing failed',
    } as ThumbnailWorkerResponse);
  }
}

/**
 * 批量处理缩略图
 */
async function processBatchThumbnails(
  items: ThumbnailWorkerMessage['items']
): Promise<void> {
  if (!items || items.length === 0) return;

  const total = items.length;
  let processed = 0;

  // 并发处理，但限制并发数
  const concurrency = 4;
  const chunks: typeof items[] = [];

  for (let i = 0; i < items.length; i += concurrency) {
    chunks.push(items.slice(i, i + concurrency));
  }

  for (const chunk of chunks) {
    await Promise.all(
      chunk.map(async (item) => {
        try {
          await processThumbnail(item.id, {
            blobData: item.blobData,
            maxWidth: item.maxWidth,
            maxHeight: item.maxHeight,
            quality: item.quality,
          });
          processed++;
          
          // 发送进度
          self.postMessage({
            type: 'progress',
            progress: processed,
            total,
          } as ThumbnailWorkerResponse);
        } catch (error) {
          processed++;
          self.postMessage({
            type: 'error',
            id: item.id,
            error: error instanceof Error ? error.message : 'Processing failed',
          } as ThumbnailWorkerResponse);
        }
      })
    );
  }
}

/**
 * 加载图片
 */
function loadImage(src: string): Promise<ImageBitmap> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      createImageBitmap(img)
        .then(resolve)
        .catch(reject);
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

/**
 * 计算缩略图尺寸
 */
function calculateThumbnailSize(
  originalWidth: number,
  originalHeight: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  const aspectRatio = originalWidth / originalHeight;

  let width = maxWidth;
  let height = maxHeight;

  if (originalWidth > originalHeight) {
    // 横向图片
    height = maxWidth / aspectRatio;
    if (height > maxHeight) {
      height = maxHeight;
      width = maxHeight * aspectRatio;
    }
  } else {
    // 纵向图片
    width = maxHeight * aspectRatio;
    if (width > maxWidth) {
      width = maxWidth;
      height = maxWidth / aspectRatio;
    }
  }

  return {
    width: Math.round(width),
    height: Math.round(height),
  };
}

