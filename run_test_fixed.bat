@echo off
chcp 65001 >nul
echo 设置环境变量并运行测试...

REM 设置环境变量
set CUDA_VISIBLE_DEVICES=0
set SR_VULKAN_DISABLE_VALIDATION=1

echo 运行测试...
python test_upscale_fixed.py

pause