#!/usr/bin/env python3
"""
简单的 sr_vulkan 测试
"""

try:
    import sr_vulkan.sr_vulkan as sr
    print("✅ sr_vulkan 导入成功")
    
    # 测试初始化
    print("🔍 测试 sr.init()...")
    result = sr.init()
    print(f"📊 sr.init() 返回: {result}")
    
    # 测试获取 GPU 信息
    print("🔍 测试 getGpuInfo()...")
    gpu_info = sr.getGpuInfo()
    print(f"📊 GPU 信息: {gpu_info}")
    
    # 测试 initSet
    print("🔍 测试 sr.initSet(0, 0)...")
    result = sr.initSet(0, 0)
    print(f"📊 sr.initSet() 返回: {result}")
    
    print("✅ 基本测试完成")
    
except Exception as e:
    print(f"❌ 测试失败: {e}")
    import traceback
    traceback.print_exc()