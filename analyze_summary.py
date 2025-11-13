#!/usr/bin/env python3
"""解析 batch_model_benchmark 生成的 summary.json 并用 Rich 输出排序表格。"""

from __future__ import annotations

import json
import math
import re
import sys
from pathlib import Path
from typing import Iterable, List, Tuple

SCALE_PATTERN = re.compile(r"_UP(\d+)X")


def infer_scale(model_name: str) -> int:
    match = SCALE_PATTERN.search(model_name)
    if match:
        try:
            return max(1, int(match.group(1)))
        except ValueError:
            pass
    return 2


def load_summary(path: Path) -> List[dict]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise SystemExit(f"❌ 找不到 summary 文件: {path}")
    except json.JSONDecodeError as exc:
        raise SystemExit(f"❌ 解析 JSON 失败: {exc}")

    if not isinstance(data, list):
        raise SystemExit("❌ summary 格式错误，应为数组")

    return data


def convert_records(records: Iterable[dict]) -> List[Tuple[str, int, float, float]]:
    rows: List[Tuple[str, int, float, float]] = []
    for record in records:
        model = record.get("model")
        seconds = record.get("seconds")
        status = record.get("status")
        if status != "success" or model is None or seconds is None:
            continue

        scale = infer_scale(model)
        normalized = seconds / (scale * scale)
        rows.append((model, scale, seconds, normalized))
    return rows


def print_table(rows: List[Tuple[str, int, float, float]]) -> None:
    try:
        from rich.console import Console
        from rich.table import Table
    except ImportError:
        # Fallback: plain text table
        print("⚠️ 未安装 rich，使用纯文本输出")
        header = f"{'顺序':>4}  {'模型':<50}  {'倍率':>3}  {'时间(s)':>8}  {'单位像素时间(s)':>15}"
        print(header)
        print("-" * len(header))
        for idx, (model, scale, seconds, normalized) in enumerate(rows, start=1):
            print(f"{idx:>4}  {model:<50}  {scale:>3}  {seconds:>8.3f}  {normalized:>15.4f}")
        return

    table = Table(title="模型耗时（按单位像素时间排序）", show_lines=False)
    table.add_column("顺序", justify="right")
    table.add_column("模型")
    table.add_column("倍率", justify="right")
    table.add_column("时间 (s)", justify="right")
    table.add_column("单位像素时间 (s)", justify="right")

    for idx, (model, scale, seconds, normalized) in enumerate(rows, start=1):
        table.add_row(
            str(idx),
            model,
            str(scale),
            f"{seconds:.3f}",
            f"{normalized:.4f}",
        )

    console = Console()
    console.print(table)


def main(argv: List[str]) -> int:
    summary_path = Path(argv[1]) if len(argv) > 1 else Path("output_dir/summary.json")
    records = load_summary(summary_path)
    rows = convert_records(records)
    rows.sort(key=lambda item: item[3])  # 按单位像素时间升序
    print_table(rows)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
