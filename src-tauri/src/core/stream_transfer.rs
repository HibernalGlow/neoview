//! 流式传输管理器
//!
//! 为大文件提供分块流式传输，支持进度反馈和取消

use log::{debug, info, warn};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, RwLock};
use std::time::Instant;

/// 默认块大小 (256KB)
pub const DEFAULT_CHUNK_SIZE: usize = 256 * 1024;

/// 大文件阈值 (1MB)
pub const LARGE_FILE_THRESHOLD: usize = 1024 * 1024;

/// 默认最大并发传输数
pub const DEFAULT_MAX_CONCURRENT: usize = 4;

/// 传输块
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferChunk {
    /// 传输 ID
    pub transfer_id: String,
    /// 块索引
    pub chunk_index: usize,
    /// 总块数
    pub total_chunks: usize,
    /// 块数据 (Base64 编码)
    pub data: String,
    /// 是否为最后一块
    pub is_last: bool,
    /// 块大小
    pub chunk_size: usize,
}

/// 传输进度
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferProgress {
    /// 传输 ID
    pub transfer_id: String,
    /// 已传输字节数
    pub transferred: usize,
    /// 总字节数
    pub total: usize,
    /// 进度百分比 (0-100)
    pub percentage: f64,
    /// 传输速度（字节/秒）
    pub speed: f64,
    /// 预计剩余时间（秒）
    pub eta: f64,
}

/// 传输状态
#[derive(Debug)]
pub struct TransferState {
    /// 传输 ID
    pub id: String,
    /// 开始时间
    pub started_at: Instant,
    /// 总大小
    pub total_size: usize,
    /// 已传输大小
    pub transferred: AtomicUsize,
    /// 是否已取消
    pub cancelled: AtomicBool,
    /// 重试次数
    pub retry_count: AtomicUsize,
    /// 最后更新时间
    pub last_update: RwLock<Instant>,
}

impl TransferState {
    /// 创建新的传输状态
    pub fn new(id: String, total_size: usize) -> Self {
        Self {
            id,
            started_at: Instant::now(),
            total_size,
            transferred: AtomicUsize::new(0),
            cancelled: AtomicBool::new(false),
            retry_count: AtomicUsize::new(0),
            last_update: RwLock::new(Instant::now()),
        }
    }

    /// 更新已传输大小
    pub fn update_transferred(&self, bytes: usize) {
        self.transferred.fetch_add(bytes, Ordering::Relaxed);
        if let Ok(mut last) = self.last_update.write() {
            *last = Instant::now();
        }
    }

    /// 获取进度
    pub fn get_progress(&self) -> TransferProgress {
        let transferred = self.transferred.load(Ordering::Relaxed);
        let elapsed = self.started_at.elapsed().as_secs_f64();
        let speed = if elapsed > 0.0 {
            transferred as f64 / elapsed
        } else {
            0.0
        };
        let remaining = self.total_size.saturating_sub(transferred);
        let eta = if speed > 0.0 {
            remaining as f64 / speed
        } else {
            0.0
        };
        let percentage = if self.total_size > 0 {
            (transferred as f64 / self.total_size as f64) * 100.0
        } else {
            0.0
        };

        TransferProgress {
            transfer_id: self.id.clone(),
            transferred,
            total: self.total_size,
            percentage,
            speed,
            eta,
        }
    }

    /// 是否已取消
    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::Relaxed)
    }

    /// 取消传输
    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::Relaxed);
    }
}

/// 流式传输管理器统计
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamTransferStats {
    /// 活动传输数
    pub active_transfers: usize,
    /// 总传输数
    pub total_transfers: u64,
    /// 总传输字节数
    pub total_bytes: u64,
    /// 最大并发数
    pub max_concurrent: usize,
    /// 块大小
    pub chunk_size: usize,
    /// 大文件阈值
    pub large_file_threshold: usize,
}

/// 流式传输管理器
pub struct StreamTransferManager {
    /// 活动传输
    active_transfers: RwLock<HashMap<String, Arc<TransferState>>>,
    /// 最大并发传输数
    max_concurrent: usize,
    /// 块大小
    chunk_size: usize,
    /// 大文件阈值
    large_file_threshold: usize,
    /// 总传输数
    total_transfers: AtomicUsize,
    /// 总传输字节数
    total_bytes: AtomicUsize,
}

impl StreamTransferManager {
    /// 创建流式传输管理器
    pub fn new() -> Self {
        Self {
            active_transfers: RwLock::new(HashMap::new()),
            max_concurrent: DEFAULT_MAX_CONCURRENT,
            chunk_size: DEFAULT_CHUNK_SIZE,
            large_file_threshold: LARGE_FILE_THRESHOLD,
            total_transfers: AtomicUsize::new(0),
            total_bytes: AtomicUsize::new(0),
        }
    }

    /// 创建带自定义配置的管理器
    pub fn with_config(max_concurrent: usize, chunk_size: usize, large_file_threshold: usize) -> Self {
        Self {
            active_transfers: RwLock::new(HashMap::new()),
            max_concurrent,
            chunk_size,
            large_file_threshold,
            total_transfers: AtomicUsize::new(0),
            total_bytes: AtomicUsize::new(0),
        }
    }

    /// 是否应使用流式传输
    pub fn should_stream(&self, size: usize) -> bool {
        size > self.large_file_threshold
    }

    /// 开始传输
    pub fn start_transfer(&self, transfer_id: &str, total_size: usize) -> Result<Arc<TransferState>, String> {
        // 检查并发限制
        let active_count = self.active_transfers.read()
            .map(|t| t.len())
            .unwrap_or(0);
        
        if active_count >= self.max_concurrent {
            return Err(format!(
                "已达到最大并发传输数 ({}), 请稍后重试",
                self.max_concurrent
            ));
        }

        let state = Arc::new(TransferState::new(transfer_id.to_string(), total_size));
        
        if let Ok(mut transfers) = self.active_transfers.write() {
            transfers.insert(transfer_id.to_string(), state.clone());
        }

        self.total_transfers.fetch_add(1, Ordering::Relaxed);
        info!("📤 开始流式传输: id={} size={}", transfer_id, total_size);

        Ok(state)
    }

    /// 完成传输
    pub fn complete_transfer(&self, transfer_id: &str) {
        if let Ok(mut transfers) = self.active_transfers.write() {
            if let Some(state) = transfers.remove(transfer_id) {
                let transferred = state.transferred.load(Ordering::Relaxed);
                self.total_bytes.fetch_add(transferred, Ordering::Relaxed);
                info!(
                    "✅ 流式传输完成: id={} bytes={} elapsed={}ms",
                    transfer_id,
                    transferred,
                    state.started_at.elapsed().as_millis()
                );
            }
        }
    }

    /// 取消传输
    pub fn cancel_transfer(&self, transfer_id: &str) -> bool {
        if let Ok(transfers) = self.active_transfers.read() {
            if let Some(state) = transfers.get(transfer_id) {
                state.cancel();
                info!("❌ 流式传输已取消: id={}", transfer_id);
                return true;
            }
        }
        false
    }

    /// 获取传输进度
    pub fn get_progress(&self, transfer_id: &str) -> Option<TransferProgress> {
        self.active_transfers.read().ok()
            .and_then(|t| t.get(transfer_id).map(|s| s.get_progress()))
    }

    /// 获取传输状态
    pub fn get_state(&self, transfer_id: &str) -> Option<Arc<TransferState>> {
        self.active_transfers.read().ok()
            .and_then(|t| t.get(transfer_id).cloned())
    }

    /// 将数据分块
    pub fn chunk_data(&self, data: &[u8]) -> Vec<Vec<u8>> {
        data.chunks(self.chunk_size)
            .map(|chunk| chunk.to_vec())
            .collect()
    }

    /// 生成传输块
    pub fn create_chunks(&self, transfer_id: &str, data: &[u8]) -> Vec<TransferChunk> {
        let chunks: Vec<Vec<u8>> = self.chunk_data(data);
        let total_chunks = chunks.len();

        chunks.into_iter().enumerate().map(|(i, chunk)| {
            use base64::{Engine as _, engine::general_purpose::STANDARD};
            let chunk_size = chunk.len();
            TransferChunk {
                transfer_id: transfer_id.to_string(),
                chunk_index: i,
                total_chunks,
                data: STANDARD.encode(&chunk),
                is_last: i == total_chunks - 1,
                chunk_size,
            }
        }).collect()
    }

    /// 获取统计信息
    pub fn stats(&self) -> StreamTransferStats {
        let active_transfers = self.active_transfers.read()
            .map(|t| t.len())
            .unwrap_or(0);

        StreamTransferStats {
            active_transfers,
            total_transfers: self.total_transfers.load(Ordering::Relaxed) as u64,
            total_bytes: self.total_bytes.load(Ordering::Relaxed) as u64,
            max_concurrent: self.max_concurrent,
            chunk_size: self.chunk_size,
            large_file_threshold: self.large_file_threshold,
        }
    }

    /// 清理已完成或已取消的传输
    pub fn cleanup(&self) {
        if let Ok(mut transfers) = self.active_transfers.write() {
            transfers.retain(|_, state| !state.is_cancelled());
        }
    }
}

impl Default for StreamTransferManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_transfer_state() {
        let state = TransferState::new("test-1".to_string(), 1024);
        assert_eq!(state.total_size, 1024);
        assert!(!state.is_cancelled());
        
        state.update_transferred(512);
        let progress = state.get_progress();
        assert_eq!(progress.transferred, 512);
        assert_eq!(progress.total, 1024);
        assert!((progress.percentage - 50.0).abs() < 0.1);
    }

    #[test]
    fn test_stream_transfer_manager() {
        let manager = StreamTransferManager::new();
        
        // 测试是否应该流式传输
        assert!(!manager.should_stream(512 * 1024)); // 512KB
        assert!(manager.should_stream(2 * 1024 * 1024)); // 2MB
        
        // 测试开始传输
        let state = manager.start_transfer("test-1", 1024 * 1024).unwrap();
        assert_eq!(state.total_size, 1024 * 1024);
        
        // 测试统计
        let stats = manager.stats();
        assert_eq!(stats.active_transfers, 1);
        
        // 测试取消
        assert!(manager.cancel_transfer("test-1"));
        assert!(state.is_cancelled());
    }

    #[test]
    fn test_chunk_data() {
        let manager = StreamTransferManager::with_config(4, 100, 1024);
        let data = vec![0u8; 250];
        let chunks = manager.chunk_data(&data);
        
        assert_eq!(chunks.len(), 3);
        assert_eq!(chunks[0].len(), 100);
        assert_eq!(chunks[1].len(), 100);
        assert_eq!(chunks[2].len(), 50);
    }

    #[test]
    fn test_concurrent_limit() {
        let manager = StreamTransferManager::with_config(2, 1024, 1024);
        
        // 开始两个传输
        manager.start_transfer("test-1", 1024).unwrap();
        manager.start_transfer("test-2", 1024).unwrap();
        
        // 第三个应该失败
        let result = manager.start_transfer("test-3", 1024);
        assert!(result.is_err());
    }
}


// ============================================================================
// Property-Based Tests
// ============================================================================

#[cfg(test)]
mod property_tests {
    use super::*;
    use proptest::prelude::*;

    proptest! {
        /// **Feature: archive-ipc-optimization, Property 5: Streaming transfer data integrity (round-trip)**
        /// *For any* binary data transferred via streaming, assembling all chunks
        /// SHALL produce data identical to the original.
        /// **Validates: Requirements 3.3**
        #[test]
        fn prop_streaming_data_integrity(
            data in prop::collection::vec(any::<u8>(), 0..10000)
        ) {
            use base64::{Engine as _, engine::general_purpose::STANDARD};
            
            let manager = StreamTransferManager::with_config(4, 100, 50);
            let chunks = manager.create_chunks("test", &data);
            
            // 重新组装数据
            let mut reassembled = Vec::new();
            for chunk in &chunks {
                let decoded = STANDARD.decode(&chunk.data).unwrap();
                reassembled.extend(decoded);
            }
            
            // 验证数据完整性
            prop_assert_eq!(reassembled, data);
        }

        /// **Feature: archive-ipc-optimization, Property 6: Progress reporting monotonicity**
        /// *For any* streaming transfer operation, progress percentage SHALL
        /// monotonically increase from 0 to 100.
        /// **Validates: Requirements 2.1, 3.2**
        #[test]
        fn prop_progress_monotonicity(
            updates in prop::collection::vec(1usize..1000, 1..20)
        ) {
            let total: usize = updates.iter().sum();
            let state = TransferState::new("test".to_string(), total);
            
            let mut last_percentage = 0.0;
            let mut transferred = 0usize;
            
            for update in updates {
                transferred += update;
                state.transferred.store(transferred, Ordering::Relaxed);
                
                let progress = state.get_progress();
                
                // 进度应该单调递增
                prop_assert!(progress.percentage >= last_percentage);
                last_percentage = progress.percentage;
            }
            
            // 最终进度应该是 100%
            prop_assert!((last_percentage - 100.0).abs() < 0.01);
        }

        /// **Feature: archive-ipc-optimization, Property 7: Concurrent transfer limiting**
        /// *For any* number of concurrent transfer requests, the system SHALL not
        /// exceed the configured maximum concurrent transfers.
        /// **Validates: Requirements 5.2**
        #[test]
        fn prop_concurrent_transfer_limiting(
            max_concurrent in 1usize..10,
            request_count in 1usize..20
        ) {
            let manager = StreamTransferManager::with_config(max_concurrent, 1024, 1024);
            
            let mut successful = 0;
            for i in 0..request_count {
                if manager.start_transfer(&format!("test-{}", i), 1024).is_ok() {
                    successful += 1;
                }
            }
            
            // 成功的传输数不应超过最大并发数
            prop_assert!(successful <= max_concurrent);
            
            // 活动传输数不应超过最大并发数
            let stats = manager.stats();
            prop_assert!(stats.active_transfers <= max_concurrent);
        }
    }
}
