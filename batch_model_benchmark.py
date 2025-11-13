#!/usr/bin/env python3
"""
批量测试 sr_vulkan 中所有可用模型。

使用 upscale_wrapper.upscale_image 依次对指定图片执行超分辨率处理，
输出结果文件并记录耗时。默认输入图片为 test_image.jpg，
结果保存在 model_outputs/ 目录下。

用法：
    python batch_model_benchmark.py [input_image] [output_dir]
"""

from __future__ import annotations

import io
import json
import os
import re
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional, Tuple

# 将 src-tauri/python 加入 sys.path 以便导入 upscale_wrapper
PROJECT_ROOT = Path(__file__).resolve().parent
PYTHON_DIR = PROJECT_ROOT / "src-tauri" / "python"
if str(PYTHON_DIR) not in sys.path:
    sys.path.insert(0, str(PYTHON_DIR))

try:
    from sr_vulkan import sr_vulkan as sr
except ImportError as exc:  # pragma: no cover - 在未安装 sr_vulkan 的环境下提示
    print("❌ 无法导入 sr_vulkan: ", exc)
    sys.exit(1)

from upscale_wrapper import upscale_image  # noqa: E402

SCALE_PATTERN = re.compile(r"_UP(\d+)X")
DEFAULT_TIMEOUT = 600.0

def discover_models() -> List[str]:
    """扫描 sr_vulkan 模块，获取所有 MODEL_* 常量名称。"""
    model_names: List[str] = []
    for name in sorted(dir(sr)):
        if not name.startswith("MODEL_"):
            continue
        try:
            _ = int(getattr(sr, name))
            model_names.append(name)
        except Exception:
            continue
    return model_names

def infer_scale(model_name: str) -> int:
    """根据模型名称猜测缩放倍率，默认返回 2。"""
    match = SCALE_PATTERN.search(model_name)
    if match:
        try:
            return max(1, int(match.group(1)))
        except ValueError:
            pass
    return 2

@dataclass
class ResultRecord:
    model: str
    status: str
    seconds: float
    output_file: Optional[str] = None
    error: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "model": self.model,
            "status": self.status,
            "seconds": round(self.seconds, 3),
            "output_file": self.output_file,
            "error": self.error,
        }

def detect_extension(data: bytes) -> str:
    """尝试使用 Pillow 检测图像格式，失败则回退为 png。"""
    try:
        from PIL import Image  # noqa: WPS433 (延迟导入以避免未安装 Pillow 的报错)
        with Image.open(io.BytesIO(data)) as img:
            fmt = (img.format or "png").lower()
            return "jpg" if fmt == "jpeg" else fmt
    except Exception:
        return "png"

def ensure_image(path: Path) -> bytes:
    """读取输入图片，如果不存在则报错。"""
    if not path.exists():
        raise FileNotFoundError(f"输入图片不存在: {path}")
    return path.read_bytes()

def run_model(
    model_name: str,
    image_data: bytes,
    scale: int,
    output_dir: Path,
    timeout: float = DEFAULT_TIMEOUT,
) -> ResultRecord:
    """执行单个模型的超分并保存结果。"""
    start = time.perf_counter()
    try:
        result, error = upscale_image(
            image_data=image_data,
            model=model_name,
            scale=scale,
            tile_size=0,
            noise_level=0,
            timeout=timeout,
            width=0,
            height=0,
        )
        duration = time.perf_counter() - start

        if result is None:
            raise RuntimeError(error or "未知错误")

        extension = detect_extension(result)
        safe_name = model_name.replace("/", "_")
        output_path = output_dir / f"{safe_name}.{extension}"
        output_path.write_bytes(result)

        print(f"✅ {model_name}: {duration:.2f}s -> {output_path.name}")
        return ResultRecord(
            model=model_name,
            status="success",
            seconds=duration,
            output_file=output_path.name,
        )

    except Exception as exc:  # noqa: BLE001
        duration = time.perf_counter() - start
        print(f"❌ {model_name}: 失败 ({exc})")
        return ResultRecord(
            model=model_name,
            status="error",
            seconds=duration,
            error=str(exc),
        )

def main(argv: List[str]) -> int:
    models = discover_models()
    if not models:
        print("⚠️ 未找到任何 MODEL_* 常量")
        return 1

    input_image = Path(argv[1]) if len(argv) > 1 else PROJECT_ROOT / "test_image.jpg"
    output_dir = Path(argv[2]) if len(argv) > 2 else PROJECT_ROOT / "model_outputs"
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"📂 输入图片: {input_image}")
    print(f"📁 输出目录: {output_dir}")
    print(f"🧪 待测试模型数量: {len(models)}")

    try:
        image_data = ensure_image(input_image)
    except FileNotFoundError as exc:
        print(f"❌ {exc}")
        return 1

    summary: List[ResultRecord] = []
    for index, model_name in enumerate(models, start=1):
        scale = infer_scale(model_name)
        print(f"\n[{index}/{len(models)}] 模型: {model_name} (推测倍率 {scale}x)")
        record = run_model(model_name, image_data, scale, output_dir)
        summary.append(record)

    summary_path = output_dir / "summary.json"
    summary_data = [record.to_dict() for record in summary]
    summary_path.write_text(json.dumps(summary_data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n📄 结果已保存到 {summary_path}")

    return 0


if __name__ == "__main__":  # pragma: no mutate
    sys.exit(main(sys.argv))
