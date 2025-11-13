@echo off
chcp 65001 >nul
echo 测试不同模型的超分效果...

REM 设置环境变量
set CUDA_VISIBLE_DEVICES=0
set SR_VULKAN_DISABLE_VALIDATION=1

echo 运行测试...
python test_models.py

pause