use serde::Serialize;
use sysinfo::{System, Disks, Networks};

/// 简化的系统信息（用于前端性能配置）
#[derive(Serialize, Debug)]
pub struct SystemInfo {
    pub total_memory: u64,
    pub available_memory: u64,
    pub cpu_cores: usize,
}

/// 获取系统信息（用于前端自适应配置）
#[tauri::command]
pub async fn get_system_info() -> Result<SystemInfo, String> {
    let mut sys = System::new_all();
    sys.refresh_memory();
    
    let total_memory = sys.total_memory();
    let available_memory = sys.available_memory();
    let cpu_cores = sys.cpus().len();
    
    Ok(SystemInfo {
        total_memory,
        available_memory,
        cpu_cores,
    })
}

#[derive(Serialize, Debug)]
pub struct SystemStats {
    pub cpu_usage: Vec<f32>,
    pub memory_total: u64,
    pub memory_used: u64,
    pub memory_free: u64,
    pub memory_cached: u64,
    pub uptime: u64,
    pub load_avg: [f64; 3],
    pub network_rx_bytes: u64,
    pub network_tx_bytes: u64,
    pub disk_total_bytes: u64,
    pub disk_used_bytes: u64,
    pub disk_free_bytes: u64,
}

#[tauri::command]
pub async fn get_system_stats() -> Result<SystemStats, String> {
    let mut sys = System::new_all();
    sys.refresh_all();
    
    let mut networks = Networks::new_with_refreshed_list();
    networks.refresh();
    
    let disks = Disks::new_with_refreshed_list();
    
    // CPU 使用率
    let cpu_usage: Vec<f32> = sys.cpus().iter().map(|cpu| cpu.cpu_usage()).collect();
    
    // 内存信息
    let memory_total = sys.total_memory();
    let memory_used = sys.used_memory();
    let memory_free = sys.total_memory() - sys.used_memory();
    let memory_cached = 0; // sysinfo 在某些平台上不提供 cached，这里简化为 0
    
    // 系统运行时间
    let uptime = System::uptime();
    
    // 负载平均
    let load_average = System::load_average();
    let load_avg = [load_average.one, load_average.five, load_average.fifteen];
    
    // 网络流量（总计）
    let (network_rx_bytes, network_tx_bytes) = networks
        .iter()
        .fold((0u64, 0u64), |(rx, tx), (_, data)| {
            (rx + data.total_received(), tx + data.total_transmitted())
        });
    
    // 磁盘空间
    let (disk_total_bytes, disk_used_bytes, disk_free_bytes) = disks
        .iter()
        .fold((0u64, 0u64, 0u64), |(total, used, free), disk| {
            (
                total + disk.total_space(),
                used + (disk.total_space() - disk.available_space()),
                free + disk.available_space(),
            )
        });
    
    Ok(SystemStats {
        cpu_usage,
        memory_total,
        memory_used,
        memory_free,
        memory_cached,
        uptime,
        load_avg,
        network_rx_bytes,
        network_tx_bytes,
        disk_total_bytes,
        disk_used_bytes,
        disk_free_bytes,
    })
}
