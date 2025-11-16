#!/usr/bin/env python3
"""Interactive CLI to pre-generate NeoView thumbnails and persist them into the
existing SQLite database.

This script mirrors the behaviour of the Rust thumbnail pipeline wherever
possible so that thumbnails appear immediately when the desktop app is opened.
"""
from __future__ import annotations

import argparse
import datetime as dt
import io
import sqlite3
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Iterator, Optional

try:
    from PIL import Image
except ImportError as exc:  # pragma: no cover - import guard
    raise SystemExit(
        "Pillow is required. Install it via `pip install pillow` before running this script"
    ) from exc

SUPPORTED_IMAGES = {"jpg", "jpeg", "png", "webp", "bmp", "gif", "avif", "tif", "tiff"}
SUPPORTED_ARCHIVES = {"zip", "cbz"}
SUPPORTED_VIDEOS = {"mp4", "mkv", "avi", "mov", "flv", "wmv", "webm", "m4v"}


@dataclass
class PendingTarget:
    path: Path
    kind: str  # image | archive | video
    detail: Optional[str] = None  # used for archive inner paths


@dataclass
class ThumbnailRecord:
    bookpath: str
    relative_thumb_path: str
    thumbnail_name: str
    hash: str
    created_at: str
    source_modified: int
    is_folder: int
    width: int
    height: int
    file_size: int


class ThumbnailDatabase:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(self.root / "thumbnails.db")
        self.conn.execute(
            """
            CREATE TABLE IF NOT EXISTS thumbnails (
                bookpath TEXT PRIMARY KEY,
                relative_thumb_path TEXT NOT NULL,
                thumbnail_name TEXT NOT NULL,
                hash TEXT NOT NULL,
                created_at TEXT NOT NULL,
                source_modified INTEGER NOT NULL,
                is_folder INTEGER NOT NULL,
                width INTEGER NOT NULL,
                height INTEGER NOT NULL,
                file_size INTEGER NOT NULL
            )
            """
        )

    def fetch(self, bookpath: str) -> Optional[ThumbnailRecord]:
        cur = self.conn.execute(
            "SELECT bookpath, relative_thumb_path, thumbnail_name, hash, created_at, source_modified,"
            " is_folder, width, height, file_size FROM thumbnails WHERE bookpath = ?",
            (bookpath,),
        )
        row = cur.fetchone()
        if not row:
            return None
        return ThumbnailRecord(*row)

    def upsert(self, record: ThumbnailRecord) -> None:
        self.conn.execute(
            "INSERT OR REPLACE INTO thumbnails (bookpath, relative_thumb_path, thumbnail_name, hash, created_at,"
            " source_modified, is_folder, width, height, file_size) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                record.bookpath,
                record.relative_thumb_path,
                record.thumbnail_name,
                record.hash,
                record.created_at,
                record.source_modified,
                record.is_folder,
                record.width,
                record.height,
                record.file_size,
            ),
        )
        self.conn.commit()


class ThumbnailBatchProcessor:
    def __init__(
        self,
        thumbnail_root: Path,
        library_root: Path,
        size: int,
        include_archives: bool,
        include_videos: bool,
        dry_run: bool,
    ) -> None:
        self.thumbnail_root = thumbnail_root
        self.library_root = library_root
        self.size = size
        self.include_archives = include_archives
        self.include_videos = include_videos
        self.dry_run = dry_run
        self.db = ThumbnailDatabase(thumbnail_root)

    def run(self, targets: Iterable[PendingTarget]) -> None:
        processed = skipped = 0
        for target in targets:
            try:
                if self._should_skip(target):
                    skipped += 1
                    continue
                record = self._generate_thumbnail(target)
                if record and not self.dry_run:
                    self.db.upsert(record)
                    processed += 1
            except Exception as exc:  # pragma: no cover - CLI logging only
                print(f"[!] {target.path}: {exc}")
        print(f"Finished. {processed} stored, {skipped} skipped.")

    def _should_skip(self, target: PendingTarget) -> bool:
        bookpath = self._bookpath(target)
        existing = self.db.fetch(bookpath)
        if not existing:
            return False
        source_mtime = self._source_mtime(target)
        thumb_path = self.thumbnail_root / existing.relative_thumb_path
        return existing.source_modified == source_mtime and thumb_path.exists()

    def _generate_thumbnail(self, target: PendingTarget) -> Optional[ThumbnailRecord]:
        image = self._load_source_image(target)
        if image is None:
            return None

        image = self._resize(image)
        output_bytes = self._encode_webp(image)
        relative_path = self._relative_path(target)
        normalized_rel = relative_path.replace("\\", "/")
        thumb_hash = self._hash_key(normalized_rel)
        today_folder = dt.datetime.utcnow().strftime("%Y/%m/%d")
        dest_dir = self.thumbnail_root / today_folder
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest_name = f"{thumb_hash}.webp"
        dest_path = dest_dir / dest_name

        if not self.dry_run:
            dest_path.write_bytes(output_bytes)

        created_at = dt.datetime.utcnow().isoformat()
        bookpath = self._bookpath(target)
        width, height = image.size
        record = ThumbnailRecord(
            bookpath=bookpath,
            relative_thumb_path=f"{today_folder.replace('\\', '/')}/{dest_name}",
            thumbnail_name=dest_name,
            hash=thumb_hash,
            created_at=created_at,
            source_modified=self._source_mtime(target),
            is_folder=0,
            width=width,
            height=height,
            file_size=len(output_bytes),
        )
        print(f"[+] {target.kind:<7} {bookpath} -> {record.relative_thumb_path}")
        return record

    def _load_source_image(self, target: PendingTarget) -> Optional[Image.Image]:
        if target.kind == "image":
            return Image.open(target.path)
        if target.kind == "archive" and self.include_archives:
            return self._image_from_archive(target.path)
        if target.kind == "video" and self.include_videos:
            return self._image_from_video(target.path)
        return None

    def _image_from_archive(self, archive_path: Path) -> Image.Image:
        import zipfile

        with zipfile.ZipFile(archive_path) as zf:
            image_names = sorted(
                (name for name in zf.namelist() if _is_supported_image_name(name)),
                key=lambda n: n.lower(),
            )
            if not image_names:
                raise RuntimeError("archive contains no supported image")
            with zf.open(image_names[0]) as fp:
                return Image.open(io.BytesIO(fp.read()))

    def _image_from_video(self, video_path: Path) -> Image.Image:
        cmd = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-ss",
            "1",
            "-i",
            str(video_path),
            "-frames:v",
            "1",
            "-f",
            "image2",
            "-vcodec",
            "png",
            "-",
        ]
        result = subprocess.run(cmd, capture_output=True)
        if result.returncode != 0:
            raise RuntimeError(f"ffmpeg failed: {result.stderr.decode().strip()}")
        return Image.open(io.BytesIO(result.stdout))

    def _resize(self, image: Image.Image) -> Image.Image:
        image = image.convert("RGBA")
        image.thumbnail((self.size, self.size), Image.LANCZOS)
        return image

    def _encode_webp(self, image: Image.Image) -> bytes:
        buffer = io.BytesIO()
        image.save(buffer, "WEBP", quality=85, method=6)
        return buffer.getvalue()

    def _bookpath(self, target: PendingTarget) -> str:
        rel = self._relative_path(target)
        if target.kind == "archive" and target.detail:
            return f"{rel}::{target.detail}"
        return rel

    def _relative_path(self, target: PendingTarget) -> str:
        try:
            relative = target.path.relative_to(self.library_root)
        except ValueError:
            relative = target.path
        return str(relative).replace("\\", "/")

    def _hash_key(self, value: str) -> str:
        import hashlib

        return hashlib.sha1(value.encode("utf-8")).hexdigest()

    def _source_mtime(self, target: PendingTarget) -> int:
        return int(target.path.stat().st_mtime)


def discover_targets(scan_dir: Path, recursive: bool, include_archives: bool, include_videos: bool) -> Iterator[PendingTarget]:
    iterator: Iterable[Path]
    iterator = scan_dir.rglob("*") if recursive else scan_dir.glob("*")
    for path in iterator:
        if path.is_dir():
            continue
        suffix = path.suffix.lower().lstrip(".")
        if suffix in SUPPORTED_IMAGES:
            yield PendingTarget(path=path, kind="image")
        elif include_archives and suffix in SUPPORTED_ARCHIVES:
            yield PendingTarget(path=path, kind="archive")
        elif include_videos and suffix in SUPPORTED_VIDEOS:
            yield PendingTarget(path=path, kind="video")


def _is_supported_image_name(name: str) -> bool:
    lower = name.lower()
    return any(lower.endswith(f".{ext}") for ext in SUPPORTED_IMAGES)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Pre-generate NeoView thumbnails")
    parser.add_argument("scan_dir", type=Path, nargs="?", help="Folder containing media to scan")
    parser.add_argument("--thumbnail-root", type=Path, dest="thumbnail_root", help="Directory that stores thumbnails.db", required=False)
    parser.add_argument("--library-root", type=Path, dest="library_root", help="Root used to build relative bookpaths (defaults to scan_dir)")
    parser.add_argument("--size", type=int, default=256, help="Maximum thumbnail edge length")
    parser.add_argument("--recursive", action="store_true", help="Scan directories recursively")
    parser.add_argument("--archives", action="store_true", help="Process ZIP/CBZ archives")
    parser.add_argument("--videos", action="store_true", help="Process video files via ffmpeg")
    parser.add_argument("--dry-run", action="store_true", help="Only report actions without writing files")
    parser.add_argument("--yes", action="store_true", help="Skip interactive confirmation")
    return parser.parse_args(argv)


def interactive_prompt(args: argparse.Namespace) -> tuple[Path, Path]:
    scan_dir = args.scan_dir or Path(input("Directory to process: ").strip())
    thumb_root = args.thumbnail_root or Path(input("Thumbnail root (where thumbnails.db lives): ").strip())
    return scan_dir.expanduser().resolve(), thumb_root.expanduser().resolve()


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    scan_dir, thumb_root = interactive_prompt(args)
    library_root = (args.library_root or scan_dir).expanduser().resolve()
    if not scan_dir.exists():
        raise SystemExit(f"Scan directory does not exist: {scan_dir}")
    if not thumb_root.exists():
        thumb_root.mkdir(parents=True, exist_ok=True)

    targets = list(discover_targets(scan_dir, args.recursive, args.archives, args.videos))
    if not targets:
        print("No supported media found.")
        return 0

    print(f"Discovered {len(targets)} targets (images/archives/videos combined).")
    if not args.yes:
        answer = input("Proceed with thumbnail generation? [y/N] ").strip().lower()
        if answer not in {"y", "yes"}:
            print("Aborted.")
            return 0

    processor = ThumbnailBatchProcessor(
        thumbnail_root=thumb_root,
        library_root=library_root,
        size=args.size,
        include_archives=args.archives,
        include_videos=args.videos,
        dry_run=args.dry_run,
    )
    processor.run(targets)
    return 0


if __name__ == "__main__":  # pragma: no cover - CLI entry
    sys.exit(main(sys.argv[1:]))
