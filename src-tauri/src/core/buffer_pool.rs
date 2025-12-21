//! 缓冲区内存池
//!
//! 复用 Vec<u8> 缓冲区，减少频繁分配开销
//! 适用于图片加载等高频场景

use parking_lot::Mutex;
use std::collections::VecDeque;

/// 默认缓冲区大小 (4MB，适合大多数图片)
const DEFAULT_BUFFER_SIZE: usize = 4 * 1024 * 1024;

/// 最大池大小（缓冲区数量）
const MAX_POOL_SIZE: usize = 8;

/// 缓冲区内存池
pub struct BufferPool {
    /// 可用缓冲区队列
    buffers: Mutex<VecDeque<Vec<u8>>>,
    /// 默认缓冲区大小
    default_size: usize,
    /// 最大池大小
    max_size: usize,
}

impl BufferPool {
    /// 创建新的缓冲区池
    pub fn new() -> Self {
        Self {
            buffers: Mutex::new(VecDeque::with_capacity(MAX_POOL_SIZE)),
            default_size: DEFAULT_BUFFER_SIZE,
            max_size: MAX_POOL_SIZE,
        }
    }

    /// 创建带自定义配置的缓冲区池
    pub fn with_config(default_size: usize, max_size: usize) -> Self {
        Self {
            buffers: Mutex::new(VecDeque::with_capacity(max_size)),
            default_size,
            max_size,
        }
    }

    /// 获取一个缓冲区
    /// 优先从池中获取，如果池为空则创建新的
    pub fn acquire(&self) -> Vec<u8> {
        let mut pool = self.buffers.lock();
        
        if let Some(mut buffer) = pool.pop_front() {
            // 清空但保留容量
            buffer.clear();
            buffer
        } else {
            // 池为空，创建新缓冲区
            Vec::with_capacity(self.default_size)
        }
    }

    /// 获取指定最小容量的缓冲区
    pub fn acquire_with_capacity(&self, min_capacity: usize) -> Vec<u8> {
        let mut pool = self.buffers.lock();
        
        // 尝试找一个足够大的缓冲区
        let mut best_idx = None;
        for (i, buf) in pool.iter().enumerate() {
            if buf.capacity() >= min_capacity {
                best_idx = Some(i);
                break;
            }
        }
        
        if let Some(idx) = best_idx {
            let mut buffer = pool.remove(idx).unwrap();
            buffer.clear();
            buffer
        } else {
            // 没有足够大的，创建新的
            Vec::with_capacity(min_capacity.max(self.default_size))
        }
    }

    /// 归还缓冲区到池中
    /// 如果池已满或缓冲区太小，则丢弃
    pub fn release(&self, mut buffer: Vec<u8>) {
        // 太小的缓冲区不值得复用
        if buffer.capacity() < self.default_size / 4 {
            return;
        }
        
        let mut pool = self.buffers.lock();
        
        if pool.len() < self.max_size {
            buffer.clear();
            pool.push_back(buffer);
        }
        // 池已满，让 buffer 自然 drop
    }

    /// 获取池统计信息
    pub fn stats(&self) -> BufferPoolStats {
        let pool = self.buffers.lock();
        let total_capacity: usize = pool.iter().map(|b| b.capacity()).sum();
        
        BufferPoolStats {
            available_buffers: pool.len(),
            total_capacity,
            max_size: self.max_size,
        }
    }

    /// 清空池
    pub fn clear(&self) {
        let mut pool = self.buffers.lock();
        pool.clear();
    }
}

impl Default for BufferPool {
    fn default() -> Self {
        Self::new()
    }
}

/// 缓冲区池统计
#[derive(Debug, Clone)]
pub struct BufferPoolStats {
    /// 可用缓冲区数量
    pub available_buffers: usize,
    /// 总容量（字节）
    pub total_capacity: usize,
    /// 最大池大小
    pub max_size: usize,
}

/// RAII 守卫，自动归还缓冲区
pub struct PooledBuffer<'a> {
    buffer: Option<Vec<u8>>,
    pool: &'a BufferPool,
}

impl<'a> PooledBuffer<'a> {
    /// 从池中获取缓冲区
    pub fn new(pool: &'a BufferPool) -> Self {
        Self {
            buffer: Some(pool.acquire()),
            pool,
        }
    }

    /// 从池中获取指定容量的缓冲区
    pub fn with_capacity(pool: &'a BufferPool, capacity: usize) -> Self {
        Self {
            buffer: Some(pool.acquire_with_capacity(capacity)),
            pool,
        }
    }

    /// 获取内部缓冲区的可变引用
    pub fn as_mut(&mut self) -> &mut Vec<u8> {
        self.buffer.as_mut().unwrap()
    }

    /// 获取内部缓冲区的引用
    pub fn as_ref(&self) -> &Vec<u8> {
        self.buffer.as_ref().unwrap()
    }

    /// 消费守卫，取出缓冲区（不归还池）
    pub fn take(mut self) -> Vec<u8> {
        self.buffer.take().unwrap()
    }

    /// 获取长度
    pub fn len(&self) -> usize {
        self.buffer.as_ref().unwrap().len()
    }

    /// 是否为空
    pub fn is_empty(&self) -> bool {
        self.buffer.as_ref().unwrap().is_empty()
    }
}

impl Drop for PooledBuffer<'_> {
    fn drop(&mut self) {
        if let Some(buffer) = self.buffer.take() {
            self.pool.release(buffer);
        }
    }
}

impl std::ops::Deref for PooledBuffer<'_> {
    type Target = Vec<u8>;

    fn deref(&self) -> &Self::Target {
        self.buffer.as_ref().unwrap()
    }
}

impl std::ops::DerefMut for PooledBuffer<'_> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        self.buffer.as_mut().unwrap()
    }
}

// 全局缓冲区池（用于图片加载）
use once_cell::sync::Lazy;

/// 图片加载专用缓冲区池
pub static IMAGE_BUFFER_POOL: Lazy<BufferPool> = Lazy::new(BufferPool::new);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_buffer_pool_basic() {
        let pool = BufferPool::new();
        
        // 获取缓冲区
        let mut buf1 = pool.acquire();
        buf1.extend_from_slice(b"hello");
        assert_eq!(buf1.len(), 5);
        
        // 归还
        pool.release(buf1);
        
        // 再次获取应该复用
        let buf2 = pool.acquire();
        assert!(buf2.is_empty()); // 已清空
        assert!(buf2.capacity() >= DEFAULT_BUFFER_SIZE);
    }

    #[test]
    fn test_pooled_buffer_raii() {
        let pool = BufferPool::new();
        
        {
            let mut buf = PooledBuffer::new(&pool);
            buf.extend_from_slice(b"test data");
            assert_eq!(buf.len(), 9);
        } // 自动归还
        
        let stats = pool.stats();
        assert_eq!(stats.available_buffers, 1);
    }

    #[test]
    fn test_pool_max_size() {
        let pool = BufferPool::with_config(1024, 2);
        
        // 获取并归还多个缓冲区
        for _ in 0..5 {
            let buf = pool.acquire();
            pool.release(buf);
        }
        
        // 池大小不应超过 max_size
        let stats = pool.stats();
        assert!(stats.available_buffers <= 2);
    }
}
