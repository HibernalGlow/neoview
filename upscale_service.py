#!/usr/bin/env python3
"""
NeoView - Upscaling Service using sr_vulkan
使用 sr_vulkan 库的超分服务
"""

import sys
import json
import argparse
from pathlib import Path
from typing import Optional, Tuple

try:
    from sr_vulkan import sr_vulkan as sr
except ImportError:
    print("ERROR: sr_vulkan not installed. Please install it with: pip install sr-vulkan", file=sys.stderr)
    sys.exit(1)


class UpscaleService:
    """Upscaling service using sr_vulkan library"""
    
    # Model mapping
    MODEL_MAP = {
        # Waifu2x models
        "WAIFU2X_CUNET_UP1X_DENOISE0X": sr.MODEL_WAIFU2X_CUNET_UP1X_DENOISE0X,
        "WAIFU2X_CUNET_UP1X_DENOISE1X": sr.MODEL_WAIFU2X_CUNET_UP1X_DENOISE1X,
        "WAIFU2X_CUNET_UP1X_DENOISE2X": sr.MODEL_WAIFU2X_CUNET_UP1X_DENOISE2X,
        "WAIFU2X_CUNET_UP1X_DENOISE3X": sr.MODEL_WAIFU2X_CUNET_UP1X_DENOISE3X,
        "WAIFU2X_CUNET_UP2X": sr.MODEL_WAIFU2X_CUNET_UP2X,
        "WAIFU2X_CUNET_UP2X_DENOISE0X": sr.MODEL_WAIFU2X_CUNET_UP2X_DENOISE0X,
        "WAIFU2X_CUNET_UP2X_DENOISE1X": sr.MODEL_WAIFU2X_CUNET_UP2X_DENOISE1X,
        "WAIFU2X_CUNET_UP2X_DENOISE2X": sr.MODEL_WAIFU2X_CUNET_UP2X_DENOISE2X,
        "WAIFU2X_CUNET_UP2X_DENOISE3X": sr.MODEL_WAIFU2X_CUNET_UP2X_DENOISE3X,
        "WAIFU2X_ANIME_UP2X": sr.MODEL_WAIFU2X_ANIME_UP2X,
        "WAIFU2X_ANIME_UP2X_DENOISE0X": sr.MODEL_WAIFU2X_ANIME_UP2X_DENOISE0X,
        "WAIFU2X_ANIME_UP2X_DENOISE1X": sr.MODEL_WAIFU2X_ANIME_UP2X_DENOISE1X,
        "WAIFU2X_ANIME_UP2X_DENOISE2X": sr.MODEL_WAIFU2X_ANIME_UP2X_DENOISE2X,
        "WAIFU2X_ANIME_UP2X_DENOISE3X": sr.MODEL_WAIFU2X_ANIME_UP2X_DENOISE3X,
        "WAIFU2X_PHOTO_UP2X": sr.MODEL_WAIFU2X_PHOTO_UP2X,
        "WAIFU2X_PHOTO_UP2X_DENOISE0X": sr.MODEL_WAIFU2X_PHOTO_UP2X_DENOISE0X,
        "WAIFU2X_PHOTO_UP2X_DENOISE1X": sr.MODEL_WAIFU2X_PHOTO_UP2X_DENOISE1X,
        "WAIFU2X_PHOTO_UP2X_DENOISE2X": sr.MODEL_WAIFU2X_PHOTO_UP2X_DENOISE2X,
        "WAIFU2X_PHOTO_UP2X_DENOISE3X": sr.MODEL_WAIFU2X_PHOTO_UP2X_DENOISE3X,
        
        # RealCUGAN models
        "REALCUGAN_PRO_UP2X": sr.MODEL_REALCUGAN_PRO_UP2X,
        "REALCUGAN_PRO_UP2X_CONSERVATIVE": sr.MODEL_REALCUGAN_PRO_UP2X_CONSERVATIVE,
        "REALCUGAN_PRO_UP2X_DENOISE3X": sr.MODEL_REALCUGAN_PRO_UP2X_DENOISE3X,
        "REALCUGAN_PRO_UP3X": sr.MODEL_REALCUGAN_PRO_UP3X,
        "REALCUGAN_PRO_UP3X_CONSERVATIVE": sr.MODEL_REALCUGAN_PRO_UP3X_CONSERVATIVE,
        "REALCUGAN_PRO_UP3X_DENOISE3X": sr.MODEL_REALCUGAN_PRO_UP3X_DENOISE3X,
        "REALCUGAN_SE_UP2X": sr.MODEL_REALCUGAN_SE_UP2X,
        "REALCUGAN_SE_UP2X_CONSERVATIVE": sr.MODEL_REALCUGAN_SE_UP2X_CONSERVATIVE,
        "REALCUGAN_SE_UP2X_DENOISE1X": sr.MODEL_REALCUGAN_SE_UP2X_DENOISE1X,
        "REALCUGAN_SE_UP2X_DENOISE2X": sr.MODEL_REALCUGAN_SE_UP2X_DENOISE2X,
        "REALCUGAN_SE_UP2X_DENOISE3X": sr.MODEL_REALCUGAN_SE_UP2X_DENOISE3X,
        "REALCUGAN_SE_UP3X": sr.MODEL_REALCUGAN_SE_UP3X,
        "REALCUGAN_SE_UP3X_CONSERVATIVE": sr.MODEL_REALCUGAN_SE_UP3X_CONSERVATIVE,
        "REALCUGAN_SE_UP3X_DENOISE3X": sr.MODEL_REALCUGAN_SE_UP3X_DENOISE3X,
        "REALCUGAN_SE_UP4X": sr.MODEL_REALCUGAN_SE_UP4X,
        "REALCUGAN_SE_UP4X_CONSERVATIVE": sr.MODEL_REALCUGAN_SE_UP4X_CONSERVATIVE,
        "REALCUGAN_SE_UP4X_DENOISE3X": sr.MODEL_REALCUGAN_SE_UP4X_DENOISE3X,
        
        # RealSR models
        "REALSR_DF2K_UP4X": sr.MODEL_REALSR_DF2K_UP4X,
        
        # Real-ESRGAN models
        "REALESRGAN_ANIMAVIDEOV3_UP2X": sr.MODEL_REALESRGAN_ANIMAVIDEOV3_UP2X,
        "REALESRGAN_ANIMAVIDEOV3_UP3X": sr.MODEL_REALESRGAN_ANIMAVIDEOV3_UP3X,
        "REALESRGAN_ANIMAVIDEOV3_UP4X": sr.MODEL_REALESRGAN_ANIMAVIDEOV3_UP4X,
        "REALESRGAN_X4PLUS_UP4X": sr.MODEL_REALESRGAN_X4PLUS_UP4X,
        "REALESRGAN_X4PLUSANIME_UP4X": sr.MODEL_REALESRGAN_X4PLUSANIME_UP4X,
    }
    
    # TTA model mapping
    MODEL_TTA_MAP = {
        "WAIFU2X_CUNET_UP1X_DENOISE0X_TTA": sr.MODEL_WAIFU2X_CUNET_UP1X_DENOISE0X_TTA,
        "WAIFU2X_CUNET_UP1X_DENOISE1X_TTA": sr.MODEL_WAIFU2X_CUNET_UP1X_DENOISE1X_TTA,
        "WAIFU2X_CUNET_UP1X_DENOISE2X_TTA": sr.MODEL_WAIFU2X_CUNET_UP1X_DENOISE2X_TTA,
        "WAIFU2X_CUNET_UP1X_DENOISE3X_TTA": sr.MODEL_WAIFU2X_CUNET_UP1X_DENOISE3X_TTA,
        "WAIFU2X_CUNET_UP2X_TTA": sr.MODEL_WAIFU2X_CUNET_UP2X_TTA,
        "WAIFU2X_CUNET_UP2X_DENOISE0X_TTA": sr.MODEL_WAIFU2X_CUNET_UP2X_DENOISE0X_TTA,
        "WAIFU2X_CUNET_UP2X_DENOISE1X_TTA": sr.MODEL_WAIFU2X_CUNET_UP2X_DENOISE1X_TTA,
        "WAIFU2X_CUNET_UP2X_DENOISE2X_TTA": sr.MODEL_WAIFU2X_CUNET_UP2X_DENOISE2X_TTA,
        "WAIFU2X_CUNET_UP2X_DENOISE3X_TTA": sr.MODEL_WAIFU2X_CUNET_UP2X_DENOISE3X_TTA,
        "WAIFU2X_ANIME_UP2X_TTA": sr.MODEL_WAIFU2X_ANIME_UP2X_TTA,
        "WAIFU2X_ANIME_UP2X_DENOISE0X_TTA": sr.MODEL_WAIFU2X_ANIME_UP2X_DENOISE0X_TTA,
        "WAIFU2X_ANIME_UP2X_DENOISE1X_TTA": sr.MODEL_WAIFU2X_ANIME_UP2X_DENOISE1X_TTA,
        "WAIFU2X_ANIME_UP2X_DENOISE2X_TTA": sr.MODEL_WAIFU2X_ANIME_UP2X_DENOISE2X_TTA,
        "WAIFU2X_ANIME_UP2X_DENOISE3X_TTA": sr.MODEL_WAIFU2X_ANIME_UP2X_DENOISE3X_TTA,
        "WAIFU2X_PHOTO_UP2X_TTA": sr.MODEL_WAIFU2X_PHOTO_UP2X_TTA,
        "WAIFU2X_PHOTO_UP2X_DENOISE0X_TTA": sr.MODEL_WAIFU2X_PHOTO_UP2X_DENOISE0X_TTA,
        "WAIFU2X_PHOTO_UP2X_DENOISE1X_TTA": sr.MODEL_WAIFU2X_PHOTO_UP2X_DENOISE1X_TTA,
        "WAIFU2X_PHOTO_UP2X_DENOISE2X_TTA": sr.MODEL_WAIFU2X_PHOTO_UP2X_DENOISE2X_TTA,
        "WAIFU2X_PHOTO_UP2X_DENOISE3X_TTA": sr.MODEL_WAIFU2X_PHOTO_UP2X_DENOISE3X_TTA,
        "REALCUGAN_PRO_UP2X_TTA": sr.MODEL_REALCUGAN_PRO_UP2X_TTA,
        "REALCUGAN_PRO_UP2X_CONSERVATIVE_TTA": sr.MODEL_REALCUGAN_PRO_UP2X_CONSERVATIVE_TTA,
        "REALCUGAN_PRO_UP2X_DENOISE3X_TTA": sr.MODEL_REALCUGAN_PRO_UP2X_DENOISE3X_TTA,
        "REALCUGAN_PRO_UP3X_TTA": sr.MODEL_REALCUGAN_PRO_UP3X_TTA,
        "REALCUGAN_PRO_UP3X_CONSERVATIVE_TTA": sr.MODEL_REALCUGAN_PRO_UP3X_CONSERVATIVE_TTA,
        "REALCUGAN_PRO_UP3X_DENOISE3X_TTA": sr.MODEL_REALCUGAN_PRO_UP3X_DENOISE3X_TTA,
        "REALCUGAN_SE_UP2X_TTA": sr.MODEL_REALCUGAN_SE_UP2X_TTA,
        "REALCUGAN_SE_UP2X_CONSERVATIVE_TTA": sr.MODEL_REALCUGAN_SE_UP2X_CONSERVATIVE_TTA,
        "REALCUGAN_SE_UP2X_DENOISE1X_TTA": sr.MODEL_REALCUGAN_SE_UP2X_DENOISE1X_TTA,
        "REALCUGAN_SE_UP2X_DENOISE2X_TTA": sr.MODEL_REALCUGAN_SE_UP2X_DENOISE2X_TTA,
        "REALCUGAN_SE_UP2X_DENOISE3X_TTA": sr.MODEL_REALCUGAN_SE_UP2X_DENOISE3X_TTA,
        "REALCUGAN_SE_UP3X_TTA": sr.MODEL_REALCUGAN_SE_UP3X_TTA,
        "REALCUGAN_SE_UP3X_CONSERVATIVE_TTA": sr.MODEL_REALCUGAN_SE_UP3X_CONSERVATIVE_TTA,
        "REALCUGAN_SE_UP3X_DENOISE3X_TTA": sr.MODEL_REALCUGAN_SE_UP3X_DENOISE3X_TTA,
        "REALCUGAN_SE_UP4X_TTA": sr.MODEL_REALCUGAN_SE_UP4X_TTA,
        "REALCUGAN_SE_UP4X_CONSERVATIVE_TTA": sr.MODEL_REALCUGAN_SE_UP4X_CONSERVATIVE_TTA,
        "REALCUGAN_SE_UP4X_DENOISE3X_TTA": sr.MODEL_REALCUGAN_SE_UP4X_DENOISE3X_TTA,
        "REALSR_DF2K_UP4X_TTA": sr.MODEL_REALSR_DF2K_UP4X_TTA,
        "REALESRGAN_ANIMAVIDEOV3_UP2X_TTA": sr.MODEL_REALESRGAN_ANIMAVIDEOV3_UP2X_TTA,
        "REALESRGAN_ANIMAVIDEOV3_UP3X_TTA": sr.MODEL_REALESRGAN_ANIMAVIDEOV3_UP3X_TTA,
        "REALESRGAN_ANIMAVIDEOV3_UP4X_TTA": sr.MODEL_REALESRGAN_ANIMAVIDEOV3_UP4X_TTA,
        "REALESRGAN_X4PLUS_UP4X_TTA": sr.MODEL_REALESRGAN_X4PLUS_UP4X_TTA,
        "REALESRGAN_X4PLUSANIME_UP4X_TTA": sr.MODEL_REALESRGAN_X4PLUSANIME_UP4X_TTA,
    }
    
    def __init__(self, gpu_id: int = 0, model_path: Optional[str] = None):
        """Initialize upscaling service"""
        self.gpu_id = gpu_id
        self.initialized = False
        
        # Initialize sr_vulkan
        try:
            init_code = sr.init()
            if init_code < 0:
                print(f"⚠️  CPU mode (init code: {init_code})", file=sys.stderr)
            else:
                print(f"✅ GPU mode initialized (init code: {init_code})")
            
            # Set GPU
            set_code = sr.initSet(gpuId=gpu_id)
            if set_code != 0:
                print(f"⚠️  Failed to set GPU {gpu_id}, using default", file=sys.stderr)
            else:
                print(f"✅ GPU {gpu_id} initialized")
            
            # Set model path if provided
            if model_path:
                sr.setModelPath(model_path)
                print(f"✅ Model path set to: {model_path}")
            
            self.initialized = True
        except Exception as e:
            print(f"❌ Failed to initialize sr_vulkan: {e}", file=sys.stderr)
            raise
    
    def upscale(
        self,
        input_path: str,
        output_path: str,
        model: str,
        scale: float = 2.0,
        tile_size: int = 400,
        tta: bool = False,
        output_format: str = "webp"
    ) -> bool:
        """
        Upscale an image
        
        Args:
            input_path: Path to input image
            output_path: Path to output image
            model: Model name
            scale: Upscaling factor (1.0-4.0)
            tile_size: Tile size for processing (0 = auto)
            tta: Use Test Time Augmentation
            output_format: Output format (jpg, png, webp, etc.)
        
        Returns:
            True if successful, False otherwise
        """
        if not self.initialized:
            print("❌ Service not initialized", file=sys.stderr)
            return False
        
        try:
            input_path = Path(input_path)
            output_path = Path(output_path)
            
            if not input_path.exists():
                print(f"❌ Input file not found: {input_path}", file=sys.stderr)
                return False
            
            # Create output directory
            output_path.parent.mkdir(parents=True, exist_ok=True)
            
            # Read input image
            with open(input_path, 'rb') as f:
                image_data = f.read()
            
            print(f"📁 Input: {input_path}")
            print(f"📊 Size: {len(image_data)} bytes")
            print(f"🎯 Model: {model}")
            print(f"📈 Scale: {scale}x")
            print(f"🧩 Tile size: {tile_size}")
            print(f"🎲 TTA: {tta}")
            print(f"📄 Output format: {output_format}")
            
            # Get model index
            model_key = f"{model}_TTA" if tta else model
            
            if model_key in self.MODEL_TTA_MAP:
                model_index = self.MODEL_TTA_MAP[model_key]
            elif model in self.MODEL_MAP:
                model_index = self.MODEL_MAP[model]
            else:
                print(f"❌ Unknown model: {model}", file=sys.stderr)
                print(f"Available models: {list(self.MODEL_MAP.keys())}", file=sys.stderr)
                return False
            
            # Add image for processing
            print("🚀 Starting upscaling...")
            back_id = 0
            result_code = sr.add(
                data=image_data,
                modelIndex=model_index,
                backId=back_id,
                scale=scale,
                format=output_format,
                tileSize=tile_size
            )
            
            if result_code != 0:
                error_msg = sr.getLastError()
                print(f"❌ Failed to add image for processing: {error_msg}", file=sys.stderr)
                return False
            
            print("⏳ Processing...")
            
            # Load result
            result = sr.load(back_id)
            if result is None:
                error_msg = sr.getLastError()
                print(f"❌ Failed to load result: {error_msg}", file=sys.stderr)
                return False
            
            output_data, output_fmt, returned_id, tick = result
            
            # Save output
            with open(output_path, 'wb') as f:
                f.write(output_data)
            
            print(f"✅ Upscaling completed!")
            print(f"📁 Output: {output_path}")
            print(f"📊 Size: {len(output_data)} bytes")
            print(f"⏱️  Time: {tick}ms")
            
            return True
            
        except Exception as e:
            print(f"❌ Error during upscaling: {e}", file=sys.stderr)
            import traceback
            traceback.print_exc()
            return False


def main():
    """Command-line interface"""
    parser = argparse.ArgumentParser(
        description="NeoView Upscaling Service using sr_vulkan"
    )
    parser.add_argument("input", help="Input image path")
    parser.add_argument("output", help="Output image path")
    parser.add_argument("--model", default="REALESRGAN_X4PLUS_UP4X", help="Model name")
    parser.add_argument("--scale", type=float, default=2.0, help="Upscaling factor")
    parser.add_argument("--tile-size", type=int, default=400, help="Tile size")
    parser.add_argument("--tta", action="store_true", help="Use TTA")
    parser.add_argument("--format", default="webp", help="Output format")
    parser.add_argument("--gpu-id", type=int, default=0, help="GPU ID")
    parser.add_argument("--model-path", help="Model path")
    
    args = parser.parse_args()
    
    try:
        service = UpscaleService(gpu_id=args.gpu_id, model_path=args.model_path)
        success = service.upscale(
            input_path=args.input,
            output_path=args.output,
            model=args.model,
            scale=args.scale,
            tile_size=args.tile_size,
            tta=args.tta,
            output_format=args.format
        )
        
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"❌ Fatal error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
