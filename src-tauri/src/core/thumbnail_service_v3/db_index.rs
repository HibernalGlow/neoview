//! 数据库索引管理模块
//! 
//! 包含从数据库加载索引的功能

use std::collections::HashSet;
use std::sync::Arc;

use crate::core::thumbnail_db::ThumbnailDb;

/// 从数据库加载索引
/// 
/// 返回三个索引集合：
/// - db_index: 所有已有缩略图的路径
/// - folder_db_index: 文件夹缩略图路径（用于快速路径判断）
/// - failed_index: 失败记录（避免重复尝试）
pub fn load_indices_from_db(
    db: &Arc<ThumbnailDb>,
) -> (HashSet<String>, HashSet<String>, HashSet<String>) {
    let mut db_index = HashSet::new();
    let mut folder_db_index = HashSet::new();
    let mut failed_index = HashSet::new();
    
    // 加载成功的缩略图路径
    if let Ok(paths) = db.get_all_thumbnail_keys() {
        for path in paths {
            db_index.insert(path);
        }
    }
    
    // 加载文件夹缩略图路径（单独加载，加速文件夹判断）
    if let Ok(paths) = db.get_folder_keys() {
        for path in paths {
            folder_db_index.insert(path);
        }
    }
    
    // 加载失败记录
    if let Ok(paths) = db.get_all_failed_keys() {
        for path in paths {
            failed_index.insert(path);
        }
    }
    
    (db_index, folder_db_index, failed_index)
}
