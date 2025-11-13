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
    test_image_path = "test_image.png"  # 请替换为实际图片路径
    
    if not os.path.exists(test_image_path):
        print(f"❌ 测试图片不存在: {test_image_path}")
        print("请将一张图片重命名为 test_image.png 并放在项目根目录")
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
            model=0,        # cunet
            scale=2,        # 2x
            tile_size=256,  # 256
            noise_level=0,  # 无降噪
            timeout=60.0,   # 60秒
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
