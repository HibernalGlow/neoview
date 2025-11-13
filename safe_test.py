#!/usr/bin/env python3
"""
安全的 sr_vulkan 测试，避免崩溃
"""

import sys
import os

# 添加 Python 模块路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src-tauri', 'python'))

def test_sr_vulkan_safe():
    """安全测试 sr_vulkan"""
    try:
        print("🔍 尝试导入 sr_vulkan...")
        from sr_vulkan import sr_vulkan as sr
        print("✅ sr_vulkan 导入成功")
        
        # 测试基本功能
        print("🔍 测试基本功能...")
        
        # 检查是否有 init 方法
        if hasattr(sr, 'init'):
            print("✅ 找到 sr.init 方法")
        else:
            print("❌ 未找到 sr.init 方法")
            return False
        
        # 检查是否有 initSet 方法
        if hasattr(sr, 'initSet'):
            print("✅ 找到 sr.initSet 方法")
        else:
            print("❌ 未找到 sr.initSet 方法")
            return False
        
        # 检查是否有 add 方法
        if hasattr(sr, 'add'):
            print("✅ 找到 sr.add 方法")
        else:
            print("❌ 未找到 sr.add 方法")
            return False
        
        # 检查是否有 load 方法
        if hasattr(sr, 'load'):
            print("✅ 找到 sr.load 方法")
        else:
            print("❌ 未找到 sr.load 方法")
            return False
        
        # 获取模型常量
        model_names = []
        for attr in dir(sr):
            if attr.startswith("MODEL_"):
                model_names.append(attr)
        
        print(f"📊 找到 {len(model_names)} 个模型常量")
        
        # 显示一些模型
        for name in sorted(model_names)[:5]:
            model_id = getattr(sr, name)
            print(f"  - {name} = {model_id}")
        
        print("✅ 基本功能测试通过")
        return True
        
    except Exception as e:
        print(f"❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_upscale_wrapper():
    """测试 upscale_wrapper"""
    try:
        print("\n🔍 测试 upscale_wrapper...")
        from upscale_wrapper import get_sr_available, get_manager
        
        # 检查 sr_vulkan 是否可用
        available = get_sr_available()
        print(f"📊 sr_vulkan 可用: {available}")
        
        if available:
            # 获取管理器
            manager = get_manager()
            print(f"📊 管理器初始化: {manager.sr_initialized}")
            
            if manager.sr_initialized:
                print("✅ upscale_wrapper 测试成功")
            else:
                print("⚠️ 管理器未初始化")
        else:
            print("⚠️ sr_vulkan 不可用")
            
    except Exception as e:
        print(f"❌ upscale_wrapper 测试失败: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    print("=== 安全测试 sr_vulkan ===")
    
    # 测试 sr_vulkan 基本功能
    sr_ok = test_sr_vulkan_safe()
    
    if sr_ok:
        # 测试 upscale_wrapper
        test_upscale_wrapper()
    else:
        print("⚠️ sr_vulkan 基本功能测试失败，跳过 upscale_wrapper 测试")