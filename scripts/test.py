from sr_vulkan import sr_vulkan as sr
from sr_vulkan.sr_vulkan import MODEL_REALESRGAN_ANIMAVIDEOV3_UP2X
import io
from PIL import Image

print("Python exe:", __import__("sys").executable)
print("sr_vulkan version:", sr.getVersion())
print("model id:", MODEL_REALESRGAN_ANIMAVIDEOV3_UP2X)

# 构造一张很小的测试图像
img = Image.new("RGB", (32, 32), (128, 128, 128))
buf = io.BytesIO()
img.save(buf, "PNG")
data = buf.getvalue()

print("init:", sr.init())
print("initSet:", sr.initSet(0, 0))

status = sr.add(data, MODEL_REALESRGAN_ANIMAVIDEOV3_UP2X, 1, 2, format="", tileSize=400)
print("add status:", status)
print("lastError:", sr.getLastError())
