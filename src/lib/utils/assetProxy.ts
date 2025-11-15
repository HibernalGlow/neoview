import { convertFileSrc } from '@tauri-apps/api/core';

/**
 * 将可能的本地路径/文件URL规范化为可以在前端直接使用的 asset URL。
 * - 保留 data:, http(s):, asset: 前缀（直接返回）
 * - 去除 file:// 前缀并调用 convertFileSrc
 * - 出错时返回原始字符串
 */
export function toAssetUrl(maybePath: string | null | undefined): string | null {
  if (!maybePath) return null;
  const s = String(maybePath);
  
  // 保留这些前缀不处理 - data/blob/http/asset URL 可以直接使用
  if (s.startsWith('data:') || s.startsWith('blob:') || s.startsWith('asset:') || s.startsWith('http:') || s.startsWith('https:')) {
    return s;
  }

  try {
    // 去掉 file:// 前缀（支持多个斜杠）
    let cleaned = s.replace(/^file:\/\//i, '');
    // 在 Windows 路径可能会保留一个额外的前导斜杠，如 /D:/...，去掉之
    if (/^\/([A-Za-z]:)/.test(cleaned)) cleaned = cleaned.replace(/^\//, '');
    // 规范化反斜杠为正斜杠，convertFileSrc 在内部能够接受本地路径，但统一格式更安全
    const normalized = cleaned.replace(/\\/g, '/');
    return convertFileSrc(normalized as unknown as string);
  } catch (e) {
    console.error('assetProxy.toAssetUrl failed for', maybePath, e);
    return maybePath;
  }
}

export default toAssetUrl;
