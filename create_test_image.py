from PIL import Image
import os

# 创建测试目录
os.makedirs(r'D:\1VSCODE\Projects\ImageAll\NeeWaifu\neoview\neoview-tauri\temp\test_images', exist_ok=True)

# 创建一个简单的测试图片
img = Image.new('RGB', (100, 100), color='red')
img.save(r'D:\1VSCODE\Projects\ImageAll\NeeWaifu\neoview\neoview-tauri\temp\test_images\test_image.png')

print("测试图片创建成功")