use std::collections::HashMap;
use std::time::{Duration, Instant};

use crate::core::fs_manager::FsItem;

#[derive(Clone)]
pub struct DirectoryCacheEntry {
    pub path: String,
    pub items: Vec<FsItem>,
    pub mtime: Option<u64>,
    pub cached_at: Instant,
    pub last_accessed: Instant,
}

impl DirectoryCacheEntry {
    pub fn new(path: String, items: Vec<FsItem>, mtime: Option<u64>) -> Self {
        let now = Instant::now();
        Self {
            path,
            items,
            mtime,
            cached_at: now,
            last_accessed: now,
        }
    }

    pub fn touch(&mut self) {
        self.last_accessed = Instant::now();
    }
}

pub struct DirectoryCache {
    capacity: usize,
    ttl: Duration,
    entries: HashMap<String, DirectoryCacheEntry>,
}

impl DirectoryCache {
    pub fn new(capacity: usize, ttl: Duration) -> Self {
        Self {
            capacity: capacity.max(1),
            ttl,
            entries: HashMap::new(),
        }
    }

    pub fn get(&mut self, path: &str, mtime: Option<u64>) -> Option<DirectoryCacheEntry> {
        if let Some(entry) = self.entries.get_mut(path) {
            if self.is_stale(entry, mtime) {
                self.entries.remove(path);
                return None;
            }
            entry.touch();
            return Some(entry.clone());
        }
        None
    }

    pub fn insert(&mut self, path: String, items: Vec<FsItem>, mtime: Option<u64>) {
        self.evict_if_needed();
        let entry = DirectoryCacheEntry::new(path.clone(), items, mtime);
        self.entries.insert(path, entry);
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn clear(&mut self) {
        self.entries.clear();
    }

    fn evict_if_needed(&mut self) {
        if self.entries.len() < self.capacity {
            return;
        }

        if let Some((oldest_key, _)) = self
            .entries
            .iter()
            .min_by_key(|(_, entry)| entry.last_accessed)
            .map(|(k, v)| (k.clone(), v.cached_at))
        {
            self.entries.remove(&oldest_key);
        }
    }

    fn is_stale(&self, entry: &DirectoryCacheEntry, mtime: Option<u64>) -> bool {
        if let (Some(entry_mtime), Some(target_mtime)) = (entry.mtime, mtime) {
            if entry_mtime != target_mtime {
                return true;
            }
        }

        entry.cached_at.elapsed() > self.ttl
    }
}
