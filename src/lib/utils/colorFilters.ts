/**
 * 颜色滤镜工具
 * 参考 OpenComic 的 filters.js 实现
 * 使用 SVG feComponentTransfer 实现颜色映射
 */

// 颜色点定义
export interface ColorPoint {
  h: number;  // 色相 0-360
  s: number;  // 饱和度 0-1+
  m: number;  // 权重/乘数
}

// 预设颜色方案
export const colorPresets: Record<string, ColorPoint[]> = {
  // 多色调预设
  redAndBlue: [
    { h: 0, s: 0, m: 1 },
    { h: 240, s: 0.6, m: 1 },
    { h: 0, s: 0.7, m: 1 },
    { h: 50, s: 1.5, m: 1 },
    { h: 0, s: 0, m: 1 },
  ],
  redAndBlueGray: [
    { h: 0, s: 0, m: 1 },
    { h: 240, s: 0.4, m: 1 },
    { h: 0, s: 0.5, m: 1 },
    { h: 50, s: 1, m: 1 },
    { h: 0, s: 0, m: 1 },
  ],
  blueSky: [
    { h: 0, s: 0, m: 1 },
    { h: 204, s: 0.73, m: 1 },
    { h: 200, s: 0.79, m: 1 },
    { h: 206, s: 0.84, m: 1 }
  ],
  violetAndBrown: [
    { h: 323, s: 0.37, m: 1 },
    { h: 321, s: 0.42, m: 1 },
    { h: 314, s: 0.49, m: 2 },
    { h: 18, s: 0.72, m: 3 },
    { h: 28, s: 0.83, m: 1 }
  ],
  violetAndCarnation: [
    { h: 0, s: 0, m: 1 },
    { h: 300, s: 0.7, m: 1 },
    { h: 300, s: 0.4, m: 2 },
    { h: 1, s: 0.4, m: 1 },
    { h: 0, s: 0, m: 1 },
  ],
  paleYellowAndBrown: [
    { h: 203, s: 0, m: 1 },
    { h: 238, s: 0.14, m: 1 },
    { h: 15, s: 0.55, m: 1 },
    { h: 14, s: 0.63, m: 1 },
    { h: 41, s: 0.5, m: 1 },
    { h: 44, s: 0.58, m: 1 },
    { h: 45, s: 0.78, m: 1 },
    { h: 48, s: 0.93, m: 1 },
    { h: 52, s: 0.95, m: 1 }
  ],
  // 单色调预设
  red: [
    { h: 0, s: 0, m: 1 },
    { h: 0, s: 0.70, m: 1 },
    { h: 0, s: 0, m: 1 },
  ],
  orange: [
    { h: 0, s: 0, m: 1 },
    { h: 30, s: 1.33, m: 1 },
    { h: 0, s: 0, m: 1 },
  ],
  yellow: [
    { h: 0, s: 0, m: 1 },
    { h: 50, s: 2, m: 1 },
    { h: 0, s: 0, m: 1 },
  ],
  green: [
    { h: 0, s: 0, m: 1 },
    { h: 120, s: 0.70, m: 1 },
    { h: 0, s: 0, m: 1 },
  ],
  blue: [
    { h: 0, s: 0, m: 1 },
    { h: 230, s: 0.70, m: 1 },
    { h: 0, s: 0, m: 1 },
  ],
  violet: [
    { h: 0, s: 0, m: 1 },
    { h: 280, s: 0.70, m: 1 },
    { h: 0, s: 0, m: 1 },
  ],
};

// 预设名称映射（中文）
export const presetNames: Record<string, string> = {
  redAndBlue: '红蓝',
  redAndBlueGray: '红蓝灰',
  blueSky: '蓝天',
  violetAndBrown: '紫棕',
  violetAndCarnation: '紫粉',
  paleYellowAndBrown: '淡黄棕',
  red: '红色',
  orange: '橙色',
  yellow: '黄色',
  green: '绿色',
  blue: '蓝色',
  violet: '紫色',
};

/**
 * HSL 转 RGB
 */
export function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  let r: number, g: number, b: number;

  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hueToRgb(p, q, h + 1 / 3);
    g = hueToRgb(p, q, h);
    b = hueToRgb(p, q, h - 1 / 3);
  }

  return { r, g, b };
}

function hueToRgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

/**
 * 保持亮度的颜色调整
 */
function keepLuminance(center: number, r: number, g: number, b: number, s: number): { r: number; g: number; b: number } {
  s = s < 1 ? 1 : s;
  const startL = (r * 0.2126) + (g * 0.7152) + (b * 0.0722);
  const increase = startL <= center;

  const _s = (s - 1);
  const p = ((1 * (Math.abs(r - center) * 0.2126)) + (1 * (Math.abs(g - center) * 0.7152)) + (1 * (Math.abs(b - center) * 0.0722)));
  const adjustedS = _s * p * 0.1;

  const _center = increase ? center - adjustedS : center + adjustedS;

  let i = 0;
  let change = Math.abs(_center - startL) / 3;

  while (true) {
    let _r = r;
    let _g = g;
    let _b = b;

    if (increase) {
      _r += change;
      _g += change;
      _b += change;
    } else {
      _r -= change;
      _g -= change;
      _b -= change;
      if (_r < 0) _r = 0;
      if (_g < 0) _g = 0;
      if (_b < 0) _b = 0;
    }

    const l = (_r * 0.2126) + (_g * 0.7152) + (_b * 0.0722);

    if ((increase && l >= _center) || (!increase && l <= _center)) break;
    if (i > 10000) break;

    change = Math.abs(_center - l) / 3;
    if (change < 0.001) change = 0.001;

    r = _r;
    g = _g;
    b = _b;
    i++;
  }

  return { r, g, b };
}

/**
 * 生成 SVG 滤镜的 feFunc 值
 */
export function generateColorizeFeFunc(colors: ColorPoint[]): { feFuncR: string; feFuncG: string; feFuncB: string } {
  // 展开权重
  const _colors: ColorPoint[] = [];
  for (const color of colors) {
    for (let n = 0; n < color.m; n++) {
      _colors.push(color);
    }
  }

  const len = _colors.length;
  const sum = 1 / (len - 1);

  const feFuncR: number[] = [];
  const feFuncG: number[] = [];
  const feFuncB: number[] = [];

  for (let i = 0; i < len; i++) {
    const color = _colors[i];
    const center = sum * i;
    const up = 1 - center;

    const _color = hslToRgb(color.h / 360, 1, 0.5);
    let { r, g, b } = _color;
    const s = color.s ?? 1;

    const m = 1 - (((r + g + b) - 1) / 2);

    const _r = s * r;
    const _g = s * g;
    const _b = s * b;

    let fR = _r > 0 ? center + up * (_r * m) : (center + (_r * m) * center);
    let fG = _g > 0 ? center + up * (_g * m) : (center + (_g * m) * center);
    let fB = _b > 0 ? center + up * (_b * m) : (center + (_b * m) * center);

    if (center === 1 && s > 1) {
      fR = fR + (_r * (s - 1));
      fG = fG + (_g * (s - 1));
      fB = fB + (_b * (s - 1));
    }

    const adjusted = keepLuminance(center, fR, fG, fB, s);
    feFuncR.push(adjusted.r);
    feFuncG.push(adjusted.g);
    feFuncB.push(adjusted.b);
  }

  return {
    feFuncR: feFuncR.join(' '),
    feFuncG: feFuncG.join(' '),
    feFuncB: feFuncB.join(' '),
  };
}

/**
 * 生成 SVG 滤镜定义 HTML
 */
export function generateSvgFilter(filterId: string, colors: ColorPoint[]): string {
  const { feFuncR, feFuncG, feFuncB } = generateColorizeFeFunc(colors);
  
  return `
    <svg style="position:absolute;width:0;height:0;pointer-events:none;">
      <defs>
        <filter id="${filterId}" color-interpolation-filters="sRGB">
          <feComponentTransfer>
            <feFuncR type="table" tableValues="${feFuncR}"/>
            <feFuncG type="table" tableValues="${feFuncG}"/>
            <feFuncB type="table" tableValues="${feFuncB}"/>
          </feComponentTransfer>
        </filter>
      </defs>
    </svg>
  `;
}

/**
 * 滤镜设置接口
 */
export interface FilterSettings {
  // 上色
  colorizeEnabled: boolean;
  colorizePreset: string;
  customColors: ColorPoint[];
  // 基础滤镜
  brightness: number;    // 100 = 正常
  contrast: number;      // 100 = 正常
  saturation: number;    // 100 = 正常
  sepia: number;         // 0 = 无
  hueRotate: number;     // 0 = 无
  invert: boolean;       // 反色
  negative: boolean;     // 负片
}

/**
 * 默认滤镜设置
 */
export const defaultFilterSettings: FilterSettings = {
  colorizeEnabled: false,
  colorizePreset: 'redAndBlueGray',
  customColors: [],
  brightness: 100,
  contrast: 100,
  saturation: 100,
  sepia: 0,
  hueRotate: 0,
  invert: false,
  negative: false,
};

/**
 * 生成 CSS filter 字符串
 */
export function generateCssFilter(settings: FilterSettings, filterId?: string): string {
  const filters: string[] = [];

  // 上色滤镜（需要先灰度化）
  if (settings.colorizeEnabled && filterId) {
    filters.push(`grayscale(100%) url(#${filterId})`);
  }

  // 基础滤镜
  if (settings.brightness !== 100) filters.push(`brightness(${settings.brightness}%)`);
  if (settings.saturation !== 100) filters.push(`saturate(${settings.saturation}%)`);
  if (settings.contrast !== 100) filters.push(`contrast(${settings.contrast}%)`);
  if (settings.sepia !== 0) filters.push(`sepia(${settings.sepia}%)`);
  if (settings.hueRotate !== 0) filters.push(`hue-rotate(${settings.hueRotate}deg)`);
  if (settings.invert) filters.push('invert(100%)');
  if (settings.negative) filters.push('invert(100%) hue-rotate(180deg)');

  return filters.join(' ');
}

/**
 * 获取当前使用的颜色方案
 */
export function getActiveColors(settings: FilterSettings): ColorPoint[] {
  if (settings.customColors.length >= 2) {
    return settings.customColors;
  }
  return colorPresets[settings.colorizePreset] || colorPresets.redAndBlueGray;
}
