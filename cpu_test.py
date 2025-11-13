#!/usr/bin/env python3
"""
测试 sr_vulkan CPU 模式
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
    
    # 尝试使用 CPU 模式 (gpuId = -1)
    print("🔍 测试 sr.initSet(-1, 0) (CPU 模式)...")
    result = sr.initSet(-1, 0)
    print(f"📊 sr.initSet() 返回: {result}")
    
    if result >= 0:
        print("✅ CPU 模式初始化成功")
        
        # 测试获取模型列表
        print("🔍 测试获取模型常量...")
        model_names = []
        for attr in dir(sr):
            if attr.startswith("MODEL_"):
                model_names.append(attr)
        
        print(f"📊 找到 {len(model_names)} 个模型:")
        for name in sorted(model_names)[:5]:  # 只显示前5个
            print(f"  - {name}")
        
    else:
        print("❌ CPU 模式初始化失败")
    
except Exception as e:
    print(f"❌ 测试失败: {e}")
    import traceback
    traceback.print_exc()