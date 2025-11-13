#!/usr/bin/env python3
"""
测试超分功能的独立脚本
"""

import sys
import os

# 添加 Python 模块路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src-tauri', 'python'))

from upscale_wrapper import upscale_image

def test_upscale():
    # 读取一个测试图片
    test_image_path = "test_image.jpg"  # 请替换为实际图片路径
    
    if not os.path.exists(test_image_path):
        print(f"❌ 测试图片不存在: {test_image_path}")
        print("尝试创建一个简单的测试图片...")
        
        # 创建一个简单的测试图片
        try:
            from PIL import Image
            import numpy as np
            
            # 创建一个 100x100 的彩色图片
            img_array = np.random.randint(0, 256, (100, 100, 3), dtype=np.uint8)
            img = Image.fromarray(img_array, 'RGB')
            img.save(test_image_path)
            print(f"✅ 已创建测试图片: {test_image_path}")
        except ImportError:
            print("❌ 需要安装 PIL 和 numpy 来创建测试图片")
            print("请运行: pip install Pillow numpy")
            return
        except Exception as e:
            print(f"❌ 创建测试图片失败: {e}")
            return
    
    try:
        # 读取图片数据
        with open(test_image_path, 'rb') as f:
            image_data = f.read()
        
        print(f"📊 读取图片: {test_image_path}")
        print(f"📊 图片大小: {len(image_data)} bytes")
        
        # 测试超分
        print("🚀 开始超分测试...")
        result, error = upscale_image(
            image_data=image_data,
            model="MODEL_REALESRGAN_X4PLUS_UP4X",  # 使用 4x RealESRGAN 模型
            scale=4,        # 4x
            tile_size=0,    # 0 表示由 sr_vulkan 自动选择 tile size
            noise_level=0,  # 无降噪
            timeout=600.0,  # 600秒
            width=0,        # 0 表示使用 scale
            height=0        # 0 表示使用 scale
        )
        
        if result is not None:
            print(f"✅ 超分成功！结果大小: {len(result)} bytes")
            
            # 保存结果
            output_path = "test_image_upscaled.png"
            with open(output_path, 'wb') as f:
                f.write(result)
            print(f"💾 结果已保存: {output_path}")
        else:
            print(f"❌ 超分失败: {error}")
    
    except Exception as e:
        print(f"❌ 测试失败: {e}")
        print(f"错误类型: {type(e).__name__}")

if __name__ == "__main__":
    test_upscale()
