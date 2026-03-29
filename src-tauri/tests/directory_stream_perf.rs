use std::fs::{self, File};
use std::io::Write;
use std::path::PathBuf;
use std::time::Duration;
use std::time::Instant;

use rand::prelude::SliceRandom;
use rand::rngs::StdRng;
use rand::SeedableRng;
use tokio::time::timeout;
use walkdir::WalkDir;

use app_lib::test_exports::{DirectoryScanner, DirectoryStreamOutput, StreamManager};

const DEFAULT_REAL_DATASET_DIR: &str = r"E:\1Hub\EH";
const DEFAULT_REAL_DATASET_TIMEOUT_SECS: u64 = 60;
const DEFAULT_REAL_DATASET_SAMPLE_COUNT: usize = 3;
const DEFAULT_REAL_DATASET_MIN_DIRECT_CHILDREN: usize = 20;
const DEFAULT_REAL_DATASET_MAX_DISCOVERY_DIRS: usize = 1200;
const DEFAULT_SAMPLE_SEED: u64 = 20260327;

#[derive(Debug)]
struct StreamPerfStats {
    total_items: usize,
    batches: usize,
    elapsed: Duration,
}

#[derive(Debug, Clone, Copy)]
struct ScanConfig {
    batch_size: usize,
    skip_hidden: bool,
}

#[derive(Debug)]
struct SweepResult {
    config: ScanConfig,
    stats: StreamPerfStats,
}

impl StreamPerfStats {
    fn items_per_sec(&self) -> f64 {
        let secs = self.elapsed.as_secs_f64();
        if secs <= f64::EPSILON {
            return self.total_items as f64;
        }
        self.total_items as f64 / secs
    }
}

fn percentile(values: &[f64], percentile: f64) -> f64 {
    if values.is_empty() {
        return 0.0;
    }
    let mut sorted = values.to_vec();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let pos = ((percentile / 100.0) * sorted.len() as f64).floor() as usize;
    sorted[pos.min(sorted.len() - 1)]
}

fn resolve_real_dataset_dir() -> PathBuf {
    std::env::var("NEOVIEW_TEST_DATASET_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(DEFAULT_REAL_DATASET_DIR))
}

fn resolve_real_dataset_timeout() -> Duration {
    let secs = std::env::var("NEOVIEW_TEST_TIMEOUT_SECS")
        .ok()
        .and_then(|raw| raw.parse::<u64>().ok())
        .filter(|v| *v > 0)
        .unwrap_or(DEFAULT_REAL_DATASET_TIMEOUT_SECS);
    Duration::from_secs(secs)
}

fn resolve_batch_sizes() -> Vec<usize> {
    let parsed = std::env::var("NEOVIEW_TEST_BATCH_SIZES")
        .ok()
        .map(|raw| {
            raw.split(',')
                .filter_map(|part| part.trim().parse::<usize>().ok())
                .collect::<Vec<_>>()
        })
        .unwrap_or_else(|| vec![10, 15, 24, 32, 50]);

    let mut unique = Vec::new();
    for size in parsed {
        if (10..=50).contains(&size) && !unique.contains(&size) {
            unique.push(size);
        }
    }

    if unique.is_empty() {
        vec![15, 32, 50]
    } else {
        unique
    }
}

fn resolve_skip_hidden_modes() -> Vec<bool> {
    match std::env::var("NEOVIEW_TEST_SKIP_HIDDEN_MODES") {
        Ok(raw) => {
            let mut modes = Vec::new();
            for part in raw.split(',') {
                match part.trim().to_ascii_lowercase().as_str() {
                    "1" | "true" => {
                        if !modes.contains(&true) {
                            modes.push(true);
                        }
                    }
                    "0" | "false" => {
                        if !modes.contains(&false) {
                            modes.push(false);
                        }
                    }
                    _ => {}
                }
            }
            if modes.is_empty() {
                vec![true, false]
            } else {
                modes
            }
        }
        Err(_) => vec![true, false],
    }
}

fn resolve_baseline_items_per_sec(env_key: &str) -> Option<f64> {
    std::env::var(env_key)
        .ok()
        .and_then(|raw| raw.parse::<f64>().ok())
        .filter(|v| *v > 0.0)
}

fn resolve_sample_count() -> usize {
    std::env::var("NEOVIEW_TEST_SAMPLE_COUNT")
        .ok()
        .and_then(|raw| raw.parse::<usize>().ok())
        .filter(|v| *v > 0)
        .unwrap_or(DEFAULT_REAL_DATASET_SAMPLE_COUNT)
}

fn resolve_min_direct_children() -> usize {
    std::env::var("NEOVIEW_TEST_MIN_DIRECT_CHILDREN")
        .ok()
        .and_then(|raw| raw.parse::<usize>().ok())
        .unwrap_or(DEFAULT_REAL_DATASET_MIN_DIRECT_CHILDREN)
}

fn resolve_sample_seed() -> u64 {
    std::env::var("NEOVIEW_TEST_SAMPLE_SEED")
        .ok()
        .and_then(|raw| raw.parse::<u64>().ok())
        .unwrap_or(DEFAULT_SAMPLE_SEED)
}

fn resolve_runs() -> usize {
    std::env::var("NEOVIEW_TEST_RUNS")
        .ok()
        .and_then(|raw| raw.parse::<usize>().ok())
        .filter(|v| *v > 0)
        .unwrap_or(1)
}

fn resolve_throughput_floor() -> Option<f64> {
    std::env::var("NEOVIEW_STREAM_REAL_MIN_AVG_ITEMS_PER_SEC")
        .ok()
        .and_then(|raw| raw.parse::<f64>().ok())
        .filter(|v| *v > 0.0)
}

fn load_sample_dirs_from_file(path: &PathBuf) -> Option<Vec<PathBuf>> {
    let content = fs::read_to_string(path).ok()?;
    let mut dirs = Vec::new();
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        dirs.push(PathBuf::from(trimmed));
    }
    if dirs.is_empty() {
        None
    } else {
        Some(dirs)
    }
}

fn export_sample_dirs(path: &PathBuf, sample_dirs: &[PathBuf]) {
    let mut out = String::new();
    for dir in sample_dirs {
        out.push_str(&dir.to_string_lossy());
        out.push('\n');
    }
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Err(err) = fs::write(path, out) {
        eprintln!("[WARN] failed to export sample list to {}: {}", path.display(), err);
    }
}

fn resolve_sample_list_file() -> Option<PathBuf> {
    std::env::var("NEOVIEW_TEST_SAMPLE_LIST_FILE")
        .ok()
        .map(PathBuf::from)
}

fn count_direct_children(path: &PathBuf) -> usize {
    fs::read_dir(path).map(|iter| iter.count()).unwrap_or(0)
}

fn discover_candidate_dirs(dataset_root: &PathBuf, min_direct_children: usize) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    candidates.push(dataset_root.clone());

    for entry in WalkDir::new(dataset_root)
        .min_depth(1)
        .max_depth(6)
        .into_iter()
        .filter_map(Result::ok)
    {
        if !entry.file_type().is_dir() {
            continue;
        }
        let dir = entry.path().to_path_buf();
        if count_direct_children(&dir) >= min_direct_children {
            candidates.push(dir);
        }
        if candidates.len() >= DEFAULT_REAL_DATASET_MAX_DISCOVERY_DIRS {
            break;
        }
    }

    candidates
}

fn choose_sample_dirs(dataset_root: &PathBuf) -> Vec<PathBuf> {
    if let Some(file) = resolve_sample_list_file() {
        if file.exists() {
            if let Some(dirs) = load_sample_dirs_from_file(&file) {
                println!(
                    "[PERF][real] loaded fixed sample list from {} (count={})",
                    file.display(),
                    dirs.len()
                );
                return dirs;
            }
        }
    }

    let sample_count = resolve_sample_count();
    let min_direct_children = resolve_min_direct_children();
    let sample_seed = resolve_sample_seed();
    let mut candidates = discover_candidate_dirs(dataset_root, min_direct_children);

    if candidates.is_empty() {
        return vec![dataset_root.clone()];
    }

    let mut r = StdRng::seed_from_u64(sample_seed);
    candidates.shuffle(&mut r);
    candidates.truncate(sample_count.min(candidates.len()));

    if let Some(file) = resolve_sample_list_file() {
        export_sample_dirs(&file, &candidates);
        println!(
            "[PERF][real] exported sample list to {} (seed={})",
            file.display(),
            sample_seed
        );
    }

    candidates
}

async fn run_stream_scan(
    dir: PathBuf,
    timeout_duration: Duration,
    scan_config: ScanConfig,
) -> StreamPerfStats {
    let manager = StreamManager::new();
    let (stream_id, handle, _reused) = manager.create_stream(&dir);
    let (tx, mut rx) = tokio::sync::mpsc::channel(128);

    let dir_clone = dir.clone();
    let handle_clone = handle.clone();
    let tx_clone = tx.clone();
    tokio::spawn(async move {
        DirectoryScanner::new(scan_config.batch_size, scan_config.skip_hidden)
            .scan_streaming(dir_clone, handle_clone, tx_clone)
            .await;
    });

    let started = Instant::now();
    let scan_result = timeout(timeout_duration, async move {
        let mut total = 0usize;
        let mut batches = 0usize;
        let mut complete_seen = false;

        while let Some(output) = rx.recv().await {
            match output {
                DirectoryStreamOutput::Batch(batch) => {
                    total += batch.items.len();
                    batches += 1;
                }
                DirectoryStreamOutput::Progress(_) => {}
                DirectoryStreamOutput::Error(err) => {
                    panic!("real dataset stream error: {}", err.message);
                }
                DirectoryStreamOutput::Complete(done) => {
                    complete_seen = true;
                    assert_eq!(done.total_items, total);
                    break;
                }
            }
        }

        assert!(complete_seen, "real dataset stream did not complete");
        assert!(batches > 0, "real dataset stream emitted no batches");
        (total, batches)
    })
    .await;

    manager.remove_stream(&stream_id);

    let (total, batches) = scan_result.unwrap_or_else(|_| {
        panic!(
            "real dataset stream timed out after {:?} for {}",
            timeout_duration,
            dir.display()
        )
    });

    StreamPerfStats {
        total_items: total,
        batches,
        elapsed: started.elapsed(),
    }
}

fn assert_against_baseline(label: &str, current: f64, env_key: &str) {
    if let Some(baseline) = resolve_baseline_items_per_sec(env_key) {
        let delta = ((current - baseline) / baseline) * 100.0;
        println!(
            "[PERF][{}] baseline={:.2} items/s, current={:.2} items/s, delta={:+.2}%",
            label, baseline, current, delta
        );
        assert!(
            current >= baseline,
            "[PERF][{}] regression detected: {:.2} < baseline {:.2}",
            label,
            current,
            baseline
        );
    }
}

fn create_temp_dir_with_files(count: usize) -> PathBuf {
    let base = std::env::temp_dir().join("neoview_stream_perf");
    // Clean old data if any
    let _ = fs::remove_dir_all(&base);
    fs::create_dir_all(&base).expect("create temp dir");

    for i in 0..count {
        let file_path = base.join(format!("file_{i}.txt"));
        let mut f = File::create(file_path).expect("create temp file");
        // small payload to avoid disk bloat
        let _ = f.write_all(b"hello");
    }

    base
}

#[tokio::test]
async fn directory_stream_perf_smoke() {
    let dir = create_temp_dir_with_files(2_000);

    let manager = StreamManager::new();
    let (stream_id, handle, _reused) = manager.create_stream(&dir);

    let (tx, mut rx) = tokio::sync::mpsc::channel(32);
    // launch streaming scan in background with owned scanner
    let dir_clone = dir.clone();
    let handle_clone = handle.clone();
    let tx_clone = tx.clone();
    tokio::spawn(async move {
        DirectoryScanner::new(32, true)
            .scan_streaming(dir_clone, handle_clone, tx_clone)
            .await;
    });

    let started = Instant::now();
    let perf_result = timeout(Duration::from_secs(5), async move {
        let mut total = 0usize;
        let mut batches = 0usize;
        let mut complete_seen = false;

        while let Some(output) = rx.recv().await {
            match output {
                DirectoryStreamOutput::Batch(batch) => {
                    total += batch.items.len();
                    batches += 1;
                }
                DirectoryStreamOutput::Progress(_) => {}
                DirectoryStreamOutput::Error(err) => {
                    panic!("stream error: {}", err.message);
                }
                DirectoryStreamOutput::Complete(done) => {
                    complete_seen = true;
                    assert_eq!(done.total_items, total);
                    break;
                }
            }
        }

        assert!(complete_seen, "stream did not complete");
        assert!(batches > 0, "no batches emitted");
        (total, batches)
    })
    .await
    .expect("stream timed out");

    // clean up
    manager.remove_stream(&stream_id);
    let _ = fs::remove_dir_all(&dir);

    let stats = StreamPerfStats {
        total_items: perf_result.0,
        batches: perf_result.1,
        elapsed: started.elapsed(),
    };
    println!(
        "[PERF][smoke] items={} batches={} elapsed_us={} throughput={:.2} items/s",
        stats.total_items,
        stats.batches,
        stats.elapsed.as_micros(),
        stats.items_per_sec()
    );
    assert_against_baseline("smoke", stats.items_per_sec(), "NEOVIEW_STREAM_SMOKE_BASELINE_ITEMS_PER_SEC");
    assert!(stats.total_items >= 1_000, "too few items streamed");
}

#[tokio::test]
async fn directory_stream_real_dataset_smoke() {
    let dataset_dir = resolve_real_dataset_dir();
    if !dataset_dir.exists() || !dataset_dir.is_dir() {
        eprintln!(
            "[SKIP] dataset dir not found: {} (set NEOVIEW_TEST_DATASET_DIR to override)",
            dataset_dir.display()
        );
        return;
    }

    let timeout_duration = resolve_real_dataset_timeout();
    let sample_dirs = choose_sample_dirs(&dataset_dir);
    let runs = resolve_runs();

    println!(
        "[PERF][real] root={} sample_count={} timeout_secs={} runs={}",
        dataset_dir.display(),
        sample_dirs.len(),
        timeout_duration.as_secs(),
        runs
    );

    let mut run_throughputs = Vec::new();

    for run_idx in 0..runs {
        let mut aggregate_items = 0usize;
        let mut aggregate_batches = 0usize;
        let mut aggregate_elapsed = Duration::ZERO;

        for (idx, dir) in sample_dirs.iter().enumerate() {
            let stats = run_stream_scan(
                dir.clone(),
                timeout_duration,
                ScanConfig {
                    batch_size: 24,
                    skip_hidden: true,
                },
            )
            .await;
            println!(
                "[PERF][real][run {}][sample {}] dataset={} items={} batches={} elapsed_us={} throughput={:.2} items/s",
                run_idx + 1,
                idx + 1,
                dir.display(),
                stats.total_items,
                stats.batches,
                stats.elapsed.as_micros(),
                stats.items_per_sec()
            );
            aggregate_items += stats.total_items;
            aggregate_batches += stats.batches;
            aggregate_elapsed += stats.elapsed;
        }

        let stats = StreamPerfStats {
            total_items: aggregate_items,
            batches: aggregate_batches,
            elapsed: aggregate_elapsed,
        };
        println!(
            "[PERF][real][run {}][aggregate] samples={} items={} batches={} elapsed_us={} throughput={:.2} items/s",
            run_idx + 1,
            sample_dirs.len(),
            stats.total_items,
            stats.batches,
            stats.elapsed.as_micros(),
            stats.items_per_sec()
        );
        run_throughputs.push(stats.items_per_sec());
    }

    let avg_throughput = run_throughputs.iter().sum::<f64>() / run_throughputs.len() as f64;
    let p95_throughput = percentile(&run_throughputs, 95.0);

    println!(
        "[PERF][real][summary] runs={} avg_throughput={:.2} items/s p95_throughput={:.2} items/s",
        runs,
        avg_throughput,
        p95_throughput
    );

    assert_against_baseline("real", avg_throughput, "NEOVIEW_STREAM_REAL_BASELINE_ITEMS_PER_SEC");

    if let Some(floor) = resolve_throughput_floor() {
        assert!(
            avg_throughput >= floor,
            "[PERF][real] avg throughput {:.2} is lower than floor {:.2}",
            avg_throughput,
            floor
        );
    }

    assert!(avg_throughput > 0.0, "real dataset has no streamed items");
}

#[tokio::test]
async fn directory_stream_real_dataset_param_sweep() {
    let dataset_dir = resolve_real_dataset_dir();
    if !dataset_dir.exists() || !dataset_dir.is_dir() {
        eprintln!(
            "[SKIP] dataset dir not found: {} (set NEOVIEW_TEST_DATASET_DIR to override)",
            dataset_dir.display()
        );
        return;
    }

    let timeout_duration = resolve_real_dataset_timeout();
    let sample_dirs = choose_sample_dirs(&dataset_dir);
    let batch_sizes = resolve_batch_sizes();
    let skip_hidden_modes = resolve_skip_hidden_modes();

    println!(
        "[PERF][sweep] root={} samples={} batch_sizes={:?} skip_hidden_modes={:?}",
        dataset_dir.display(),
        sample_dirs.len(),
        batch_sizes,
        skip_hidden_modes
    );

    let mut results: Vec<SweepResult> = Vec::new();

    for &batch_size in &batch_sizes {
        for &skip_hidden in &skip_hidden_modes {
            let config = ScanConfig {
                batch_size,
                skip_hidden,
            };

            let mut aggregate_items = 0usize;
            let mut aggregate_batches = 0usize;
            let mut aggregate_elapsed = Duration::ZERO;

            for dir in &sample_dirs {
                let stats = run_stream_scan(dir.clone(), timeout_duration, config).await;
                aggregate_items += stats.total_items;
                aggregate_batches += stats.batches;
                aggregate_elapsed += stats.elapsed;
            }

            let aggregate = StreamPerfStats {
                total_items: aggregate_items,
                batches: aggregate_batches,
                elapsed: aggregate_elapsed,
            };

            println!(
                "[PERF][sweep] batch_size={} skip_hidden={} items={} batches={} elapsed_us={} throughput={:.2} items/s",
                config.batch_size,
                config.skip_hidden,
                aggregate.total_items,
                aggregate.batches,
                aggregate.elapsed.as_micros(),
                aggregate.items_per_sec()
            );

            results.push(SweepResult {
                config,
                stats: aggregate,
            });
        }
    }

    results.sort_by(|a, b| {
        b.stats
            .items_per_sec()
            .partial_cmp(&a.stats.items_per_sec())
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    println!("[PERF][sweep] ranking (best -> worst):");
    for (idx, item) in results.iter().enumerate() {
        println!(
            "[PERF][sweep][rank {}] batch_size={} skip_hidden={} throughput={:.2} items/s items={} elapsed_us={}",
            idx + 1,
            item.config.batch_size,
            item.config.skip_hidden,
            item.stats.items_per_sec(),
            item.stats.total_items,
            item.stats.elapsed.as_micros()
        );
    }

    assert!(!results.is_empty(), "sweep produced no result");
    assert!(
        results[0].stats.total_items > 0,
        "sweep best case has no streamed items"
    );
}
