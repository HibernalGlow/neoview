//! NeoView - Book Models
//! 书籍相关的 Rust 数据模型

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum BookType {
    Archive,
    Folder,
    Pdf,
    Media,
    Epub,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum PageSortMode {
    /// 文件名升序
    FileName,
    /// 文件名降序
    FileNameDescending,
    /// 文件大小升序
    FileSize,
    /// 文件大小降序
    FileSizeDescending,
    /// 修改时间升序
    TimeStamp,
    /// 修改时间降序
    TimeStampDescending,
    /// 随机顺序
    Random,
    /// 按读取顺序（Entry 顺序）
    Entry,
    /// 按读取顺序反向
    EntryDescending,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum ReadOrder {
    LeftToRight,
    RightToLeft,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum PageMode {
    SinglePage,
    WidePage,
    TwoPage,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Page {
    /// 页面索引
    pub index: usize,
    /// 页面原始顺序（Entry 顺序）
    pub entry_index: usize,
    /// 页面路径
    pub path: String,
    /// 内部路径（用于压缩包内的文件）
    pub inner_path: Option<String>,
    /// 文件名
    pub name: String,
    /// 文件大小 (字节)
    pub size: u64,
    /// 图像宽度
    pub width: Option<u32>,
    /// 图像高度
    pub height: Option<u32>,
    /// 是否已加载
    pub loaded: bool,
    /// 是否是封面
    pub is_cover: Option<bool>,
    /// 缩略图数据 (base64)
    pub thumbnail: Option<String>,
    /// 稳定哈希值（用于缓存键）
    pub stable_hash: String,
    /// 最后修改时间（unix 时间戳，单位：秒）
    pub modified: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookInfo {
    /// 书籍路径
    pub path: String,
    /// 书籍名称
    pub name: String,
    /// 书籍类型
    #[serde(rename = "type")]
    pub book_type: BookType,
    /// 总页数
    pub total_pages: usize,
    /// 当前页索引
    pub current_page: usize,
    /// 页面列表
    pub pages: Vec<Page>,
    /// 排序模式
    pub sort_mode: PageSortMode,
    /// 阅读顺序
    pub read_order: ReadOrder,
    /// 页面模式
    pub page_mode: PageMode,
    /// 创建时间
    pub created_at: Option<String>,
    /// 修改时间
    pub modified_at: Option<String>,
    /// 文件大小
    pub file_size: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookHistory {
    /// 书籍路径
    pub path: String,
    /// 书籍名称
    pub name: String,
    /// 最后访问时间
    pub last_access: String,
    /// 最后阅读页码
    pub last_page: usize,
    /// 总页数
    pub total_pages: usize,
    /// 缩略图
    pub thumbnail: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Bookmark {
    /// ID
    pub id: String,
    /// 书籍路径
    pub book_path: String,
    /// 页面索引
    pub page_index: usize,
    /// 书签名称
    pub name: Option<String>,
    /// 创建时间
    pub created_at: String,
    /// 注释
    pub comment: Option<String>,
}

impl Page {
    pub fn new(index: usize, path: String, name: String, size: u64) -> Self {
        Self {
            index,
            entry_index: index,
            path,
            inner_path: None,
            name,
            size,
            width: None,
            height: None,
            loaded: false,
            is_cover: None,
            thumbnail: None,
            stable_hash: String::new(), // 将在 BookManager 中计算
            modified: None,
        }
    }

    pub fn with_stable_hash(mut self, stable_hash: String) -> Self {
        self.stable_hash = stable_hash;
        self
    }

    pub fn with_inner_path(mut self, inner_path: Option<String>) -> Self {
        self.inner_path = inner_path;
        self
    }

    pub fn with_entry_index(mut self, entry_index: usize) -> Self {
        self.entry_index = entry_index;
        self
    }

    pub fn with_modified(mut self, modified: Option<i64>) -> Self {
        self.modified = modified;
        self
    }
}

impl BookInfo {
    pub fn new(path: String, name: String, book_type: BookType) -> Self {
        Self {
            path,
            name,
            book_type,
            total_pages: 0,
            current_page: 0,
            pages: Vec::new(),
            sort_mode: PageSortMode::FileName,
            read_order: ReadOrder::LeftToRight,
            page_mode: PageMode::SinglePage,
            created_at: None,
            modified_at: None,
            file_size: None,
        }
    }
}
