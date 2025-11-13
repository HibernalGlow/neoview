#!/usr/bin/env python3
"""
测试不同模型的超分效果
"""

import os
import sys

# 设置环境变量
os.environ['CUDA_VISIBLE_DEVICES'] = '0'
os.environ['SR_VULKAN_DISABLE_VALIDATION'] = '1'

# 添加 Python 模块路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src-tauri', 'python'))

from upscale_wrapper import upscale_image

def test_different_models():
    # 读取测试图片
    test_image_path = "test_image.jpg"
    
    if not os.path.exists(test_image_path):
        print(f"❌ 测试图片不存在: {test_image_path}")
        return
    
    # 读取图片数据
    with open(test_image_path, 'rb') as f:
        image_data = f.read()
    
    print(f"📊 读取图片: {test_image_path}")
    print(f"📊 图片大小: {len(image_data)} bytes")
    
    # 测试不同模型
    models = [
        (0, "MODEL_WAIFU2X_CUNET_UP2X", "cunet"),
        (2, "MODEL_WAIFU2X_ANIME_UP2X", "anime"),
        (1, "MODEL_WAIFU2X_PHOTO_UP2X", "photo"),
    ]
    
    for model_id, model_name, desc in models:
        print(f"\n{'='*50}")
        print(f"🚀 测试模型: {desc} ({model_name})")
        print(f"{'='*50}")
        
        result, error = upscale_image(
            image_data=image_data,
            model=model_id,
            scale=2,
            tile_size=256,
            noise_level=0,
            timeout=60.0,
            width=0,
            height=0
        )
        
        if result is not None:
            print(f"✅ 超分成功！结果大小: {len(result)} bytes")
            
            # 保存结果
            output_path = f"test_image_{desc}_upscaled.jpg"
            with open(output_path, 'wb') as f:
                f.write(result)
            print(f"💾 结果已保存: {output_path}")
        else:
            print(f"❌ 超分失败: {error}")

if __name__ == "__main__":
    test_different_models()