/**
 * 命令到 API 端点的映射表
 * 将 Tauri 命令名映射到 Python HTTP API 端点
 */

export interface EndpointMapping {
    path: string;
    method: 'GET' | 'POST' | 'DELETE';
    body?: (args: Record<string, unknown>) => unknown;
}

type CommandMapper = (args?: Record<string, unknown>) => EndpointMapping;

// 辅助函数：URL 编码
const enc = (val: unknown) => encodeURIComponent(String(val));

// ===== 命令映射表 =====
const commands: Record<string, CommandMapper> = {
    // 目录相关
    load_directory_snapshot: (a) => ({ path: `/directory/snapshot?path=${enc(a?.path)}`, method: 'GET' }),
    list_subfolders: (a) => ({ path: `/directory/subfolders?path=${enc(a?.path)}`, method: 'GET' }),
    get_images_in_directory: (a) => ({ path: `/directory/images?path=${enc(a?.path)}&recursive=${a?.recursive ?? false}`, method: 'GET' }),
    read_directory: (a) => ({ path: `/directory/list?path=${enc(a?.path)}`, method: 'GET' }),

    // 文件相关
    path_exists: (a) => ({ path: `/file/exists?path=${enc(a?.path)}`, method: 'GET' }),
    get_file_info: (a) => ({ path: `/file/info?path=${enc(a?.path)}`, method: 'GET' }),
    get_file_metadata: (a) => ({ path: `/file/info?path=${enc(a?.path)}`, method: 'GET' }),
    create_directory: (a) => ({ path: '/file/mkdir', method: 'POST', body: () => ({ path: a?.path }) }),
    delete_path: (a) => ({ path: `/file?path=${enc(a?.path)}`, method: 'DELETE' }),
    delete_file: (a) => ({ path: `/file?path=${enc(a?.path)}`, method: 'DELETE' }),
    rename_path: (a) => ({ path: '/file/rename', method: 'POST', body: () => ({ from_path: a?.from, to_path: a?.to }) }),
    move_to_trash: (a) => ({ path: '/file/trash', method: 'POST', body: () => ({ path: a?.path }) }),
    move_to_trash_async: (a) => ({ path: '/file/trash', method: 'POST', body: () => ({ path: a?.path }) }),
    read_text_file: (a) => ({ path: `/file/text?path=${enc(a?.path)}`, method: 'GET' }),
    write_text_file: (a) => ({ path: '/file/write', method: 'POST', body: () => ({ path: a?.path, content: a?.content }) }),

    // 压缩包相关
    list_archive_contents: (a) => ({ path: `/archive/list?path=${enc(a?.archivePath)}`, method: 'GET' }),

    // 缩略图相关
    init_thumbnail_service_v3: (a) => ({ path: '/thumbnail/init', method: 'POST', body: () => a }),
    request_visible_thumbnails_v3: (a) => ({ path: '/thumbnail/visible', method: 'POST', body: () => a }),
    cancel_thumbnail_requests_v3: (a) => ({ path: '/thumbnail/cancel', method: 'POST', body: () => ({ dir: a?.dir }) }),
    reload_thumbnail_v3: (a) => ({ path: '/thumbnail/reload', method: 'POST', body: () => a }),
    clear_thumbnail_cache_v3: () => ({ path: '/thumbnail/cache', method: 'DELETE' }),
    vacuum_thumbnail_db_v3: () => ({ path: '/thumbnail/vacuum', method: 'POST' }),
    preload_directory_thumbnails_v3: (a) => ({ path: '/thumbnail/preload', method: 'POST', body: () => a }),

    // 书籍相关
    open_book: (a) => ({ path: `/book/open?path=${enc(a?.path)}`, method: 'POST' }),
    close_book: () => ({ path: '/book/close', method: 'POST' }),
    get_current_book: () => ({ path: '/book/current', method: 'GET' }),
    navigate_to_page: (a) => ({ path: '/book/navigate', method: 'POST', body: () => ({ page_index: a?.pageIndex }) }),
    next_page: () => ({ path: '/book/next', method: 'POST' }),
    previous_page: () => ({ path: '/book/previous', method: 'POST' }),
    set_book_sort_mode: (a) => ({ path: '/book/sort', method: 'POST', body: () => ({ sort_mode: a?.sortMode }) }),

    // 超分相关
    upscale_service_init: (a) => ({ path: '/upscale/init', method: 'POST', body: () => a }),
    init_pyo3_upscaler: (a) => ({ path: '/upscale/init', method: 'POST', body: () => a }),
    upscale_service_request: (a) => ({ path: '/upscale/request', method: 'POST', body: () => a }),
    upscale_service_cancel_page: (a) => ({ path: `/upscale/cancel/${a?.taskId || 'current'}`, method: 'POST' }),
    check_pyo3_upscaler_availability: () => ({ path: '/upscale/available', method: 'GET' }),
    get_pyo3_available_models: () => ({ path: '/upscale/models', method: 'GET' }),
    get_pyo3_cache_stats: () => ({ path: '/upscale/cache-stats', method: 'GET' }),
    upscale_service_set_enabled: (a) => ({ path: '/upscale/enabled', method: 'POST', body: () => ({ enabled: a?.enabled }) }),
    upscale_service_sync_conditions: (a) => ({ path: '/upscale/conditions', method: 'POST', body: () => a }),
    upscale_service_set_current_book: (a) => ({ path: '/upscale/current-book', method: 'POST', body: () => ({ book_path: a?.bookPath }) }),
    upscale_service_set_current_page: (a) => ({ path: '/upscale/current-page', method: 'POST', body: () => ({ page_index: a?.pageIndex }) }),
    upscale_service_request_preload_range: (a) => ({ path: '/upscale/preload-range', method: 'POST', body: () => a }),
    upscale_service_cancel_book: (a) => ({ path: '/upscale/cancel-book', method: 'POST', body: () => ({ book_path: a?.bookPath }) }),
    upscale_service_clear_cache: (a) => ({ path: '/upscale/clear-cache', method: 'POST', body: () => ({ book_path: a?.bookPath }) }),
    pyo3_cancel_job: (a) => ({ path: '/upscale/cancel-job', method: 'POST', body: () => ({ job_key: a?.jobKey }) }),

    // 视频相关
    generate_video_thumbnail: (a) => ({ path: `/video/thumbnail?path=${enc(a?.videoPath)}&time_seconds=${a?.timeSeconds ?? 10}`, method: 'GET' }),
    get_video_duration: (a) => ({ path: `/video/duration?path=${enc(a?.videoPath)}`, method: 'GET' }),
    is_video_file: (a) => ({ path: `/video/check?path=${enc(a?.filePath)}`, method: 'GET' }),
    check_ffmpeg_available: () => ({ path: '/system/ffmpeg', method: 'GET' }),

    // 系统相关
    get_startup_config: () => ({ path: '/system/startup-config', method: 'GET' }),
    save_startup_config: (a) => ({ path: '/system/startup-config', method: 'POST', body: () => a?.config }),
    update_startup_config_field: (a) => ({ path: '/system/startup-config/field', method: 'POST', body: () => ({ field: a?.field, value: a?.value }) }),
    get_home_dir: () => ({ path: '/system/home-dir', method: 'GET' }),

    // EMM 相关
    find_emm_databases: () => ({ path: '/emm/databases', method: 'GET' }),
    find_emm_setting_file: () => ({ path: '/emm/setting-file', method: 'GET' }),
    load_emm_metadata: () => ({ path: '/emm/metadata', method: 'GET' }),
    save_emm_json: (a) => ({ path: '/emm/save', method: 'POST', body: () => a }),
    get_emm_json: (a) => ({ path: `/emm/json?path=${enc(a?.path)}`, method: 'GET' }),
    update_rating_data: (a) => ({ path: '/emm/rating', method: 'POST', body: () => a }),
    update_manual_tags: (a) => ({ path: '/emm/manual-tags', method: 'POST', body: () => a }),
    save_ai_translation: (a) => ({ path: '/emm/ai-translation', method: 'POST', body: () => a }),
    get_rating_data: (a) => ({ path: `/emm/rating-data?path=${enc(a?.path)}`, method: 'GET' }),
    batch_get_rating_data: (a) => ({ path: '/emm/rating-data/batch', method: 'POST', body: () => ({ paths: a?.paths }) }),
    get_rating_data_by_prefix: (a) => ({ path: `/emm/rating-data/prefix?prefix=${enc(a?.prefix)}`, method: 'GET' }),

    // 页面帧相关
    pf_update_context: (a) => ({ path: '/page-frame/context', method: 'POST', body: () => a }),

    // 图片尺寸相关
    get_image_dimensions: (a) => ({ path: `/dimensions?path=${enc(a?.path)}`, method: 'GET' }),

    // 页面管理相关
    pm_preload_thumbnails: (a) => ({ path: '/thumbnail/preload-pages', method: 'POST', body: () => a }),

    // 视频相关
    extract_video_to_temp: (a) => ({ path: `/video/extract-to-temp?archive_path=${enc(a?.archivePath)}&inner_path=${enc(a?.filePath)}`, method: 'GET' }),
    load_text_from_archive: (a) => ({ path: `/archive/text?archive_path=${enc(a?.archivePath)}&inner_path=${enc(a?.filePath)}`, method: 'GET' }),

    // 缩略图数据库维护
    get_thumbnail_db_stats_v3: () => ({ path: '/thumbnail/db-stats', method: 'GET' }),
    migrate_thumbnail_db: () => ({ path: '/thumbnail/migrate', method: 'POST' }),
    clear_expired_thumbnails_v3: (a) => ({ path: '/thumbnail/clear-expired', method: 'POST', body: () => a }),
    clear_thumbnails_by_path_v3: (a) => ({ path: '/thumbnail/clear-by-path', method: 'POST', body: () => a }),

    // 超分缓存
    clear_all_pyo3_cache: () => ({ path: '/upscale/clear-all-cache', method: 'POST' }),

    // AI 翻译
    get_ai_translation_count: () => ({ path: '/ai/translation-count', method: 'GET' }),
};

/**
 * 获取命令对应的端点映射
 */
export function getEndpoint(cmd: string, args?: Record<string, unknown>): EndpointMapping | null {
    const mapper = commands[cmd];
    if (!mapper) return null;
    return mapper(args);
}

/**
 * 检查命令是否已映射
 */
export function isCommandMapped(cmd: string): boolean {
    return cmd in commands;
}
