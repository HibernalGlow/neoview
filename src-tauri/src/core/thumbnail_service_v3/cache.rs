//! 缓存管理模块
//! 
//! 包含 LRU 内存缓存管理、缓存获取、内存压力检查等功能

use lru::LruCache;
use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::time::Instant;

use super::{log_debug, ThumbnailServiceConfig};

/// 从内存缓存获取（使用写锁因为 LRU 需要更新访问顺序）
pub fn get_from_memory_cache(
    memory_cache: &Arc<RwLock<LruCache<String, Vec<u8>>>>,
    save_queue: &Arc<Mutex<HashMap<String, (Vec<u8>, i64, i32, Instant)>>>,
    path: &str,
) -> Option<Vec<u8>> {
    // 先检查内存缓存（LRU.get 需要写锁来更新访问顺序）
    if let Ok(mut cache) = memory_cache.write() {
        if let Some(blob) = cache.get(path) {
            return Some(blob.clone());
        }
    }
    
    // 再检查保存队列（可能刚生成还未持久化）
    if let Ok(queue) = save_queue.lock() {
        if let Some((blob, _, _, _)) = queue.get(path) {
            return Some(blob.clone());
        }
    }
    
    None
}

/// 从内存缓存获取（使用读锁 peek，不更新 LRU 顺序）
/// 用于协议处理器（/thumb/{key}）：并发 <img> 请求无需争抢写锁更新 LRU 顺序
pub fn peek_from_memory_cache(
    memory_cache: &Arc<RwLock<LruCache<String, Vec<u8>>>>,
    save_queue: &Arc<Mutex<HashMap<String, (Vec<u8>, i64, i32, Instant)>>>,
    path: &str,
) -> Option<Vec<u8>> {
    // 读锁 peek：50 个并发 <img> 加载不会互相阻塞
    if let Ok(cache) = memory_cache.read() {
        if let Some(blob) = cache.peek(path) {
            return Some(blob.clone());
        }
    }
    
    if let Ok(queue) = save_queue.lock() {
        if let Some((blob, _, _, _)) = queue.get(path) {
            return Some(blob.clone());
        }
    }
    
    None
}

/// 仅检查内存缓存是否存在（不更新 LRU 顺序，使用读锁）
pub fn has_in_memory_cache(
    memory_cache: &Arc<RwLock<LruCache<String, Vec<u8>>>>,
    save_queue: &Arc<Mutex<HashMap<String, (Vec<u8>, i64, i32, Instant)>>>,
    path: &str,
) -> bool {
    if let Ok(cache) = memory_cache.read() {
        if cache.peek(path).is_some() {
            return true;
        }
    }
    
    if let Ok(queue) = save_queue.lock() {
        if queue.contains_key(path) {
            return true;
        }
    }
    
    false
}

/// 检查内存压力并自动清理（当超过阈值时清理一半缓存）
pub fn check_memory_pressure(
    memory_cache: &Arc<RwLock<LruCache<String, Vec<u8>>>>,
    memory_cache_bytes: &Arc<AtomicUsize>,
    max_bytes: usize,
) {
    let current_bytes = memory_cache_bytes.load(Ordering::SeqCst);
    
    if current_bytes > max_bytes {
        log_debug!("⚠️ 内存压力检测: {} bytes > {} bytes，清理一半缓存", current_bytes, max_bytes);
        
        if let Ok(mut cache) = memory_cache.write() {
            let target_size = cache.len() / 2;
            while cache.len() > target_size {
                if cache.pop_lru().is_none() {
                    break;
                }
            }
            
            // 重新计算内存使用
            let new_bytes: usize = cache.iter().map(|(_, v)| v.len()).sum();
            memory_cache_bytes.store(new_bytes, Ordering::SeqCst);
            
            log_debug!("✅ 清理后缓存大小: {} 条, {} bytes", cache.len(), new_bytes);
        }
    }
}

/// 两阶段智能缓存清理（参考 NeeView ThumbnailPool 策略）
/// 
/// 阶段1（150%阈值）：仅清理无效引用（已被释放的条目）
/// 阶段2（120%阈值）：清理最老的条目直到回到限制
/// 
/// max_bytes: 缓存大小限制（字节）
pub fn two_phase_cache_cleanup(
    memory_cache: &Arc<RwLock<LruCache<String, Vec<u8>>>>,
    memory_cache_bytes: &Arc<AtomicUsize>,
    config: &ThumbnailServiceConfig,
    max_bytes: usize,
) {
    let budget = config.memory_cache_byte_budget.min(max_bytes);
    let current_bytes = memory_cache_bytes.load(Ordering::SeqCst);
    let decay_threshold = budget.saturating_mul(config.memory_cache_decay_threshold_percent.max(1)) / 100;

    if current_bytes >= decay_threshold {
        if let Ok(mut cache) = memory_cache.write() {
            let cache_len = cache.len();
            if cache_len > 0 {
                let drop_percent = config.memory_cache_decay_drop_percent.max(1);
                let mut drop_count = cache_len.saturating_mul(drop_percent) / 100;
                if drop_count == 0 {
                    drop_count = 1;
                }
                for _ in 0..drop_count {
                    if cache.pop_lru().is_none() {
                        break;
                    }
                }
            }

            let mut new_bytes: usize = cache.iter().map(|(_, v)| v.len()).sum();
            while new_bytes > budget && !cache.is_empty() {
                cache.pop_lru();
                new_bytes = cache.iter().map(|(_, v)| v.len()).sum();
            }

            memory_cache_bytes.store(new_bytes, Ordering::SeqCst);
            log_debug!(
                "🧹 字节预算清理完成: {} 条, {} bytes (budget={} bytes)",
                cache.len(),
                new_bytes,
                budget
            );
        }
    }
}
