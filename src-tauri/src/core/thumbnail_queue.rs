use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, mpsc};
use std::thread;

use crate::core::thumbnail::ThumbnailManager;
use crate::core::image_cache::ImageCache;

/// 单个任务
struct Task {
    key: String,
    path: PathBuf,
    is_folder: bool,
}

/// 优先队列+去重的缩略图任务处理器
pub struct ThumbnailQueue {
    high_tx: mpsc::Sender<Task>,
    normal_tx: mpsc::Sender<Task>,
    // pending: key -> list of responders
    pending: Arc<Mutex<HashMap<String, Vec<mpsc::Sender<Result<String, String>>>>>>, 
}

impl ThumbnailQueue {
    /// 启动队列处理器
    /// manager_guard: Arc<Mutex<Option<ThumbnailManager>>> 用于在 worker 中获得 manager
    pub fn start(
        manager_guard: Arc<Mutex<Option<ThumbnailManager>>>,
        cache_guard: Arc<Mutex<ImageCache>>,
        worker_count: usize,
    ) -> Arc<Self> {
        let (high_tx, high_rx) = mpsc::channel::<Task>();
        let (normal_tx, normal_rx) = mpsc::channel::<Task>();
        let pending: Arc<Mutex<HashMap<String, Vec<mpsc::Sender<Result<String, String>>>>>> = Arc::new(Mutex::new(HashMap::new()));

        // Wrap receivers so they can be shared across workers (protected by a mutex)
        let high_rx = Arc::new(Mutex::new(high_rx));
        let normal_rx = Arc::new(Mutex::new(normal_rx));

        let queue = Arc::new(Self { high_tx, normal_tx, pending: pending.clone() });

        // spawn workers
        for _ in 0..worker_count {
            let mgr = manager_guard.clone();
            let _cache = cache_guard.clone();
            let high_r = high_rx.clone();
            let normal_r = normal_rx.clone();
            let pending_clone = pending.clone();

            thread::spawn(move || {
                loop {
                    // 优先取高优先级任务（非阻塞尝试）
                    let mut task_opt: Option<Task> = None;

                    if let Ok(mut hr) = high_r.lock() {
                        match hr.try_recv() {
                            Ok(t) => task_opt = Some(t),
                            Err(mpsc::TryRecvError::Empty) => {},
                            Err(mpsc::TryRecvError::Disconnected) => break,
                        }
                    }

                    // 如果没有高优先级任务，尝试从普通队列获取（先非阻塞，再阻塞等待）
                    if task_opt.is_none() {
                        if let Ok(mut nr) = normal_r.lock() {
                            match nr.try_recv() {
                                Ok(t) => task_opt = Some(t),
                                Err(mpsc::TryRecvError::Empty) => {
                                    // 阻塞等待普通队列的新任务
                                    match nr.recv() {
                                        Ok(t2) => task_opt = Some(t2),
                                        Err(_) => break,
                                    }
                                }
                                Err(mpsc::TryRecvError::Disconnected) => break,
                            }
                        }
                    }

                    if let Some(t) = task_opt {
                        // 处理任务：调用 manager 生成缩略图
                        let key = t.key.clone();
                        let result = (|| {
                            // obtain manager
                            let guard = mgr.lock().map_err(|e| format!("manager lock poisoned: {}", e))?;
                            if let Some(ref manager) = *guard {
                                // try to perform generation
                                let path = t.path.clone();
                                // compute relative and source_modified
                                let rel = manager.get_relative_path(&path).map_err(|e| e)?;
                                let meta = std::fs::metadata(&path).map_err(|e| format!("读取文件元数据失败: {}", e))?;
                                let source_modified = meta.modified().map_err(|e| format!("获取修改时间失败: {}", e))?
                                    .duration_since(std::time::UNIX_EPOCH).map_err(|e| format!("时间转换失败: {}", e))?.as_secs() as i64;

                                manager.generate_and_save_thumbnail(&path, &rel, source_modified, t.is_folder)
                            } else {
                                Err("缩略图管理器未初始化".to_string())
                            }
                        })();

                        // collect responders and respond
                        let mut responders = Vec::new();
                        if let Ok(mut map) = pending_clone.lock() {
                            if let Some(vec) = map.remove(&key) {
                                responders = vec;
                            }
                        }

                        for r in responders {
                            // ignore send errors
                            let _ = r.send(result.clone());
                        }
                    } else {
                        // no task and channels probably closed
                        break;
                    }
                }
            });
        }

        queue
    }

    /// 入队（阻塞等待结果）
    pub fn enqueue(&self, path: PathBuf, is_folder: bool, priority: bool) -> Result<String, String> {
        let key = path.to_string_lossy().replace('\\', "/");

        // create oneshot responder
        let (tx, rx) = mpsc::channel::<Result<String, String>>();

        // dedup logic: if already pending, append responder and return rx
        let mut should_send = true;
        if let Ok(mut map) = self.pending.lock() {
            if let Some(vec) = map.get_mut(&key) {
                vec.push(tx);
                should_send = false;
            } else {
                map.insert(key.clone(), vec![tx]);
            }
        }

        if should_send {
            let task = Task { key: key.clone(), path: path.clone(), is_folder };
            // send to proper channel
            let res = if priority {
                self.high_tx.send(task)
            } else {
                self.normal_tx.send(task)
            };

            if res.is_err() {
                // send failed, cleanup pending
                if let Ok(mut map) = self.pending.lock() {
                    if let Some(vec) = map.remove(&key) {
                        for r in vec { let _ = r.send(Err("队列发送失败".to_string())); }
                    }
                }
                return Err("队列发送失败".to_string());
            }
        }

        // wait for result
        match rx.recv() {
            Ok(Ok(url)) => Ok(url),
            Ok(Err(e)) => Err(e),
            Err(e) => Err(format!("等待结果失败: {}", e)),
        }
    }
}