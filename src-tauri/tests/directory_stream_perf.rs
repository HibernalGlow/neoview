use std::fs::{self, File};
use std::io::Write;
use std::path::PathBuf;
use std::time::Duration;

use tokio::time::timeout;

use app_lib::test_exports::{DirectoryScanner, DirectoryStreamOutput, StreamManager};

const DEFAULT_REAL_DATASET_DIR: &str = r"E:\1Hub\EH";
const DEFAULT_REAL_DATASET_TIMEOUT_SECS: u64 = 60;

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
        total
    })
    .await
    .expect("stream timed out");

    // clean up
    manager.remove_stream(&stream_id);
    let _ = fs::remove_dir_all(&dir);

    assert!(perf_result >= 1_000, "too few items streamed");
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
    let manager = StreamManager::new();
    let (stream_id, handle, _reused) = manager.create_stream(&dataset_dir);
    let (tx, mut rx) = tokio::sync::mpsc::channel(128);

    let dir_clone = dataset_dir.clone();
    let handle_clone = handle.clone();
    let tx_clone = tx.clone();
    tokio::spawn(async move {
        DirectoryScanner::new(32, true)
            .scan_streaming(dir_clone, handle_clone, tx_clone)
            .await;
    });

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
        total
    })
    .await;

    manager.remove_stream(&stream_id);

    let total = scan_result.unwrap_or_else(|_| {
        panic!(
            "real dataset stream timed out after {:?} for {}",
            timeout_duration,
            dataset_dir.display()
        )
    });
    assert!(total > 0, "real dataset has no streamed items");
}
