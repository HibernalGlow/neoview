/**
 * 图片预渲染 Worker
 * 使用 OffscreenCanvas 在后台线程预缩放图片
 * 
 * 注意：此文件需要作为 Web Worker 加载
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx: Worker = self as any;

ctx.onmessage = async (e: MessageEvent) => {
  const { type, id, imageUrl, targetWidth, targetHeight } = e.data;
  
  if (type === 'render') {
    try {
      // 加载图片
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const imageBitmap = await createImageBitmap(blob);
      
      // 计算缩放比例（保持宽高比）
      const scale = Math.min(
        targetWidth / imageBitmap.width,
        targetHeight / imageBitmap.height
      );
      const scaledWidth = Math.round(imageBitmap.width * scale);
      const scaledHeight = Math.round(imageBitmap.height * scale);
      
      // 创建 OffscreenCanvas 并绘制缩放后的图片
      const canvas = new OffscreenCanvas(scaledWidth, scaledHeight);
      const canvasCtx = canvas.getContext('2d');
      
      if (!canvasCtx) {
        throw new Error('Failed to get 2d context');
      }
      
      // 高质量缩放
      canvasCtx.imageSmoothingEnabled = true;
      canvasCtx.imageSmoothingQuality = 'high';
      canvasCtx.drawImage(imageBitmap, 0, 0, scaledWidth, scaledHeight);
      
      // 释放原始 bitmap
      imageBitmap.close();
      
      // 转换为 ImageBitmap 传回主线程
      const resultBitmap = await createImageBitmap(canvas);
      
      ctx.postMessage({
        type: 'rendered',
        id,
        bitmap: resultBitmap,
        width: scaledWidth,
        height: scaledHeight,
      }, { transfer: [resultBitmap] });
      
    } catch (err) {
      ctx.postMessage({
        type: 'error',
        id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
};

export {};
