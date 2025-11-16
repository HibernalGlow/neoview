#!/usr/bin/env python3
"""
启动 Python 缩略图服务的便捷脚本
"""

import os
import sys
import subprocess
import time
import requests

def check_dependencies():
    """检查依赖是否安装"""
    try:
        import fastapi
        import uvicorn
        import pyvips
        print("✅ 所有依赖已安装")
        return True
    except ImportError as e:
        print(f"❌ 缺少依赖: {e}")
        print("请运行: pip install -r requirements.txt")
        return False

def start_service():
    """启动服务"""
    print("🚀 启动 Python 缩略图服务...")
    
    # 启动服务进程
    process = subprocess.Popen([
        sys.executable, "-m", "uvicorn", 
        "thumbnail_service:app",
        "--host", "127.0.0.1",
        "--port", "8899",
        "--log-level", "info"
    ], cwd=os.path.dirname(os.path.abspath(__file__)))
    
    # 等待服务启动
    print("⏳ 等待服务启动...")
    for i in range(30):
        try:
            response = requests.get("http://127.0.0.1:8899/health", timeout=1)
            if response.status_code == 200:
                print("✅ 服务启动成功!")
                print(f"   响应: {response.json()}")
                return process
        except:
            time.sleep(1)
    
    print("❌ 服务启动超时")
    process.terminate()
    return None

def main():
    """主函数"""
    print("Python + pyvips 缩略图服务启动器")
    print("=" * 40)
    
    # 检查依赖
    if not check_dependencies():
        return 1
    
    # 启动服务
    process = start_service()
    if not process:
        return 1
    
    try:
        print("\n📝 服务正在运行，按 Ctrl+C 停止...")
        process.wait()
    except KeyboardInterrupt:
        print("\n🛑 正在停止服务...")
        process.terminate()
        process.wait()
        print("✅ 服务已停止")
    
    return 0

if __name__ == "__main__":
    sys.exit(main())