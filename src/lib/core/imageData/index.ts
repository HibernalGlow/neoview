/**
 * ImageData 模块 - 统一图片数据管理
 * 
 * 参考 NeeView (C#) 和 OpenComic (JS) 的设计模式：
 * - PageDataRepository: 统一的页面数据仓库
 * - 零重复 IPC: 同一图片只从后端获取一次
 * - 零重复解码: 尺寸、ImageBitmap 随数据一同缓存
 * - 请求合并: 多组件同时请求复用同一 Promise
 */

export {
  PageDataRepository,
  getPageDataRepository,
  resetPageDataRepository,
  type PageData,
  type PageDataOptions,
} from './PageDataRepository';
