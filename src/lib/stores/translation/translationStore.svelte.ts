/**
 * 翻译叠加层 Store
 * 管理翻译区域数据，支持按页面索引存储和查询
 */
import { SvelteMap } from 'svelte/reactivity';

/** 翻译区域的样式配置 */
export interface TranslationStyle {
  /** 字体大小 (px) */
  fontSize: number;
  /** 字体系列 */
  fontFamily: string;
  /** 文字颜色 */
  color: string;
  /** 背景颜色（可选） */
  backgroundColor?: string;
  /** 描边颜色（可选） */
  strokeColor?: string;
  /** 描边宽度 */
  strokeWidth?: number;
}

/** 翻译区域定义 */
export interface TranslationRegion {
  /** 唯一标识 */
  id: string;
  /** 页面索引（绑定到图片） */
  pageIndex: number;
  /** 多边形顶点（相对于图片左上角的像素坐标） */
  polygon: { x: number; y: number }[];
  /** 原文 */
  originalText: string;
  /** 译文 */
  translatedText: string;
  /** 旋转角度 (度) */
  rotation: number;
  /** 样式配置 */
  style: TranslationStyle;
  /** 可见性 */
  visible: boolean;
  /** 是否已翻译 */
  translated: boolean;
  /** 置信度 (0-1) */
  confidence?: number;
}

/** 叠加层全局设置 */
export interface TranslationOverlaySettings {
  /** 是否启用叠加层 */
  enabled: boolean;
  /** 是否显示边界框 */
  showBoundingBox: boolean;
  /** 边界框颜色 */
  boundingBoxColor: string;
  /** 边界框宽度 */
  boundingBoxWidth: number;
  /** 是否显示原文 */
  showOriginal: boolean;
  /** 是否显示译文 */
  showTranslation: boolean;
  /** 悬停时显示原文 */
  showOriginalOnHover: boolean;
  /** 默认样式 */
  defaultStyle: TranslationStyle;
  /** 叠加层透明度 (0-1) */
  opacity: number;
}

/** 默认样式 */
const defaultStyle: TranslationStyle = {
  fontSize: 14,
  fontFamily: 'sans-serif',
  color: '#ffffff',
  backgroundColor: 'rgba(0, 0, 0, 0.7)',
  strokeColor: '#000000',
  strokeWidth: 0,
};

/** 默认设置 */
const defaultSettings: TranslationOverlaySettings = {
  enabled: true,
  showBoundingBox: true,
  boundingBoxColor: '#3b82f6',
  boundingBoxWidth: 2,
  showOriginal: false,
  showTranslation: true,
  showOriginalOnHover: true,
  defaultStyle: { ...defaultStyle },
  opacity: 1,
};

export class TranslationStore {
  /** 按页面索引存储的区域映射 */
  private regions = $state<SvelteMap<number, TranslationRegion[]>>(new SvelteMap());
  
  /** 全局设置 */
  private settings = $state<TranslationOverlaySettings>({ ...defaultSettings });
  
  /** 版本号（用于响应式更新） */
  private _version = $state(0);

  /** 获取版本号 */
  get version(): number {
    return this._version;
  }

  /** 获取设置 */
  get overlaySettings(): TranslationOverlaySettings {
    return this.settings;
  }

  /** 更新设置 */
  updateSettings(partial: Partial<TranslationOverlaySettings>): void {
    this.settings = { ...this.settings, ...partial };
    this._version++;
    this.saveToLocalStorage();
  }

  /** 获取指定页面的翻译区域 */
  getRegions(pageIndex: number): TranslationRegion[] {
    // 触发响应式依赖
    void this._version;
    return this.regions.get(pageIndex) ?? [];
  }

  /** 获取所有页面的翻译区域 */
  getAllRegions(): SvelteMap<number, TranslationRegion[]> {
    return new SvelteMap(this.regions);
  }

  /** 设置指定页面的翻译区域 */
  setRegions(pageIndex: number, regions: TranslationRegion[]): void {
    this.regions.set(pageIndex, regions);
    this._version++;
  }

  /** 添加翻译区域 */
  addRegion(region: TranslationRegion): void {
    const existing = this.regions.get(region.pageIndex) ?? [];
    this.regions.set(region.pageIndex, [...existing, region]);
    this._version++;
  }

  /** 更新翻译区域 */
  updateRegion(regionId: string, updates: Partial<TranslationRegion>): void {
    for (const [pageIndex, regions] of this.regions) {
      const idx = regions.findIndex(r => r.id === regionId);
      if (idx !== -1) {
        regions[idx] = { ...regions[idx], ...updates };
        this.regions.set(pageIndex, [...regions]);
        this._version++;
        return;
      }
    }
  }

  /** 删除翻译区域 */
  removeRegion(regionId: string): void {
    for (const [pageIndex, regions] of this.regions) {
      const filtered = regions.filter(r => r.id !== regionId);
      if (filtered.length !== regions.length) {
        this.regions.set(pageIndex, filtered);
        this._version++;
        return;
      }
    }
  }

  /** 清除指定页面的翻译区域 */
  clearPage(pageIndex: number): void {
    if (this.regions.has(pageIndex)) {
      this.regions.delete(pageIndex);
      this._version++;
    }
  }

  /** 清除所有翻译区域 */
  clearAll(): void {
    this.regions.clear();
    this._version++;
  }

  /** 切换叠加层启用状态 */
  toggleEnabled(): void {
    this.settings.enabled = !this.settings.enabled;
    this._version++;
    this.saveToLocalStorage();
  }

  /** 切换边界框显示 */
  toggleBoundingBox(): void {
    this.settings.showBoundingBox = !this.settings.showBoundingBox;
    this._version++;
    this.saveToLocalStorage();
  }

  /** 创建新的翻译区域（辅助方法） */
  createRegion(
    pageIndex: number,
    polygon: { x: number; y: number }[],
    originalText: string = '',
    translatedText: string = ''
  ): TranslationRegion {
    return {
      id: `region_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      pageIndex,
      polygon,
      originalText,
      translatedText,
      rotation: 0,
      style: { ...this.settings.defaultStyle },
      visible: true,
      translated: translatedText.length > 0,
    };
  }

  /** 计算多边形边界框 */
  static getBounds(polygon: { x: number; y: number }[]): {
    x: number;
    y: number;
    width: number;
    height: number;
    centerX: number;
    centerY: number;
  } {
    if (polygon.length === 0) {
      return { x: 0, y: 0, width: 0, height: 0, centerX: 0, centerY: 0 };
    }
    const xs = polygon.map(p => p.x);
    const ys = polygon.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
    };
  }

  /** 保存设置到 localStorage */
  private saveToLocalStorage(): void {
    try {
      localStorage.setItem('neoview_translation_settings', JSON.stringify(this.settings));
    } catch (e) {
      console.warn('保存翻译设置失败:', e);
    }
  }

  /** 从 localStorage 加载设置 */
  loadFromLocalStorage(): void {
    try {
      const saved = localStorage.getItem('neoview_translation_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        this.settings = { ...defaultSettings, ...parsed };
      }
    } catch (e) {
      console.warn('加载翻译设置失败:', e);
    }
  }

  /** 导入翻译数据（JSON 格式） */
  importFromJson(json: string): { success: boolean; count: number; error?: string } {
    try {
      const data = JSON.parse(json);
      if (!Array.isArray(data)) {
        return { success: false, count: 0, error: '数据格式错误：应为数组' };
      }
      
      let count = 0;
      for (const region of data) {
        if (this.isValidRegion(region)) {
          this.addRegion(region as TranslationRegion);
          count++;
        }
      }
      
      return { success: true, count };
    } catch (e) {
      return { success: false, count: 0, error: String(e) };
    }
  }

  /** 导出翻译数据为 JSON */
  exportToJson(): string {
    const allRegions: TranslationRegion[] = [];
    for (const regions of this.regions.values()) {
      allRegions.push(...regions);
    }
    return JSON.stringify(allRegions, null, 2);
  }

  /** 验证区域数据有效性 */
  private isValidRegion(obj: unknown): boolean {
    if (typeof obj !== 'object' || obj === null) return false;
    const r = obj as Record<string, unknown>;
    return (
      typeof r.id === 'string' &&
      typeof r.pageIndex === 'number' &&
      Array.isArray(r.polygon) &&
      r.polygon.every((p: unknown) => 
        typeof p === 'object' && p !== null && 
        typeof (p as Record<string, unknown>).x === 'number' && 
        typeof (p as Record<string, unknown>).y === 'number'
      )
    );
  }
}

/** 全局单例 */
export const translationStore = new TranslationStore();

// 初始化时加载设置
if (typeof window !== 'undefined') {
  translationStore.loadFromLocalStorage();
}
