//! LZ4 压缩/解压功能

use lz4_flex::{compress_prepend_size, decompress_size_prepended};

/// LZ4 压缩魔数 (用于识别压缩数据)
pub(crate) const LZ4_MAGIC: &[u8] = b"LZ4\x00";

/// LZ4 压缩 blob 数据
/// 返回带有魔数前缀的压缩数据
pub fn compress_blob(data: &[u8]) -> Result<Vec<u8>, String> {
    if data.is_empty() {
        return Ok(data.to_vec());
    }
    
    let compressed = compress_prepend_size(data);
    
    // 添加魔数前缀以标识压缩数据
    let mut result = Vec::with_capacity(LZ4_MAGIC.len() + compressed.len());
    result.extend_from_slice(LZ4_MAGIC);
    result.extend_from_slice(&compressed);
    
    Ok(result)
}

/// LZ4 解压 blob 数据
/// 自动检测是否为压缩数据
pub fn decompress_blob(data: &[u8]) -> Result<Vec<u8>, String> {
    if data.is_empty() {
        return Ok(data.to_vec());
    }
    
    // 检查是否有 LZ4 魔数前缀
    if data.len() > LZ4_MAGIC.len() && &data[..LZ4_MAGIC.len()] == LZ4_MAGIC {
        // 是压缩数据，解压
        let compressed_data = &data[LZ4_MAGIC.len()..];
        decompress_size_prepended(compressed_data)
            .map_err(|e| format!("LZ4 解压失败: {e}"))
    } else {
        // 不是压缩数据，直接返回
        Ok(data.to_vec())
    }
}

/// 检查数据是否已压缩
#[allow(dead_code)]
pub fn is_compressed(data: &[u8]) -> bool {
    data.len() > LZ4_MAGIC.len() && &data[..LZ4_MAGIC.len()] == LZ4_MAGIC
}
