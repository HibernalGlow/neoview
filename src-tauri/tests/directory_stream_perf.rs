use std::fs::{self, File};
use std::io::Write;
use std::path::PathBuf;
use std::time::Duration;

use tokio::time::timeout;

use app_lib::test_exports::{DirectoryScanner, DirectoryStreamOutput, StreamManager};

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
