use std::fs::{self, File};
use std::io::Write;
use std::path::PathBuf;
use std::time::Duration;
use std::time::Instant;

use rand::prelude::SliceRandom;
use rand::thread_rng;
use tokio::time::timeout;
use walkdir::WalkDir;

use app_lib::test_exports::{DirectoryScanner, DirectoryStreamOutput, StreamManager};

const DEFAULT_REAL_DATASET_DIR: &str = r"E:\1Hub\EH";
const DEFAULT_REAL_DATASET_TIMEOUT_SECS: u64 = 60;
const DEFAULT_REAL_DATASET_SAMPLE_COUNT: usize = 3;
const DEFAULT_REAL_DATASET_MIN_DIRECT_CHILDREN: usize = 20;
const DEFAULT_REAL_DATASET_MAX_DISCOVERY_DIRS: usize = 1200;

#[derive(Debug)]
struct StreamPerfStats {
    total_items: usize,
    batches: usize,
    elapsed: Duration,
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
    let sample_count = resolve_sample_count();
    let min_direct_children = resolve_min_direct_children();
    let mut candidates = discover_candidate_dirs(dataset_root, min_direct_children);

    if candidates.is_empty() {
        return vec![dataset_root.clone()];
    }

    let mut r = thread_rng();
    candidates.shuffle(&mut r);
    candidates.truncate(sample_count.min(candidates.len()));
    candidates
}

async fn run_stream_scan(dir: PathBuf, timeout_duration: Duration) -> StreamPerfStats {
    let manager = StreamManager::new();
    let (stream_id, handle, _reused) = manager.create_stream(&dir);
    let (tx, mut rx) = tokio::sync::mpsc::channel(128);

    let dir_clone = dir.clone();
    let handle_clone = handle.clone();
    let tx_clone = tx.clone();
    tokio::spawn(async move {
        DirectoryScanner::new(32, true)
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

fn assert_against_baseline(label: &str, stats: &StreamPerfStats, env_key: &str) {
    if let Some(baseline) = resolve_baseline_items_per_sec(env_key) {
        let current = stats.items_per_sec();
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
        "[PERF][smoke] items={} batches={} elapsed_ms={} throughput={:.2} items/s",
        stats.total_items,
        stats.batches,
        stats.elapsed.as_millis(),
        stats.items_per_sec()
    );
    assert_against_baseline(
        "smoke",
        &stats,
        "NEOVIEW_STREAM_SMOKE_BASELINE_ITEMS_PER_SEC",
    );
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

    println!(
        "[PERF][real] root={} sample_count={} timeout_secs={}",
        dataset_dir.display(),
        sample_dirs.len(),
        timeout_duration.as_secs()
    );

    let mut aggregate_items = 0usize;
    let mut aggregate_batches = 0usize;
    let mut aggregate_elapsed = Duration::ZERO;

    for (idx, dir) in sample_dirs.iter().enumerate() {
        let stats = run_stream_scan(dir.clone(), timeout_duration).await;
        println!(
            "[PERF][real][sample {}] dataset={} items={} batches={} elapsed_ms={} throughput={:.2} items/s",
            idx + 1,
            dir.display(),
            stats.total_items,
            stats.batches,
            stats.elapsed.as_millis(),
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
        "[PERF][real][aggregate] samples={} items={} batches={} elapsed_ms={} throughput={:.2} items/s",
        sample_dirs.len(),
        stats.total_items,
        stats.batches,
        stats.elapsed.as_millis(),
        stats.items_per_sec()
    );
    assert_against_baseline(
        "real",
        &stats,
        "NEOVIEW_STREAM_REAL_BASELINE_ITEMS_PER_SEC",
    );
    assert!(stats.total_items > 0, "real dataset has no streamed items");
}
