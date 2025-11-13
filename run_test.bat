@echo off
echo 设置环境变量并运行测试...

REM 设置可能的解决方案
set CUDA_VISIBLE_DEVICES=0
set SR_VULKAN_DISABLE_VALIDATION=1

echo 运行测试...
python safe_test.py

pause