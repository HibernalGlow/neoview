# Thumbnail Batch CLI

`thumbnail_batch_cli.py` 是一个独立的 Python 命令行工具，用于按照 NeoView 桌面端的同款逻辑，提前为指定目录批量生成缩略图并写入 `thumbnails.db`。这样在正式打开应用时即可直接命中缓存，避免重复计算。

## 依赖

- Python 3.12+
- [Pillow](https://python-pillow.org/)（如未安装：`pip install pillow`）
- （可选）`ffmpeg`：启用 `--videos` 时抽帧用

## 常用参数

| 参数 | 说明 |
| --- | --- |
| `scan_dir` | 要扫描的目录；若省略则运行时交互输入 |
| `--thumbnail-root` | 缩略图数据库目录（默认交互输入） |
| `--library-root` | 计算 `bookpath` 的根目录，缺省为 `scan_dir` |
| `--size` | 缩略图最大边长，默认 `256` |
| `--recursive` | 递归扫描子目录 |
| `--archives` | 同步处理 ZIP/CBZ 内部首图 |
| `--videos` | 使用 `ffmpeg` 为视频抽帧 |
| `--dry-run` | 仅打印将执行的操作，不写文件 |
| `--yes` | 跳过交互确认 |

## 示例

```bash
uv run python scripts/thumbnail_batch_cli.py D:/Comics/Series1 \
  --thumbnail-root D:/NeoView/cache/thumbnails \
  --library-root D:/Comics \
  --recursive --archives --videos --yes
```

## 工作流程

1. 扫描目标目录并识别图片 / 压缩包 / 视频。
2. 对每个目标复用与 Rust 端一致的路径归一化与哈希策略。
3. 生成 WebP 缩略图并存放于 `thumbnail_root/YYYY/MM/DD/<hash>.webp`。
4. 向 `thumbnails.db` 写入 / 更新记录（含尺寸、大小、源文件 mtime）。

## 注意事项

- 该脚本不会修改应用现有逻辑，只是提前填充数据库。
- 若配合 `--dry-run` 可用于审查即将写入的内容。
- 处理压缩包与视频前请确认 `ffmpeg` 可用，否则任务会被跳过并记录。
