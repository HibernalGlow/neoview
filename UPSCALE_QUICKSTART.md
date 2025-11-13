# NeoView Upscaling - Quick Start Guide

## ⚡ 5-Minute Setup

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Verify Installation
```bash
python upscale_service.py --help
```

You should see the help message with available options.

### 3. Test with Sample Image
```bash
python upscale_service.py input.jpg output.webp
```

## 🎨 Common Use Cases

### Upscale Anime/Digital Art (4x)
```bash
python upscale_service.py image.jpg output.webp \
  --model REALESRGAN_X4PLUSANIME_UP4X \
  --scale 4.0
```

### Upscale Photo (4x)
```bash
python upscale_service.py photo.jpg output.webp \
  --model REALESRGAN_X4PLUS_UP4X \
  --scale 4.0
```

### Upscale with Quality Enhancement (TTA)
```bash
python upscale_service.py image.jpg output.webp \
  --model REALESRGAN_X4PLUS_UP4X \
  --scale 4.0 \
  --tta
```

### Low Memory Mode
```bash
python upscale_service.py image.jpg output.webp \
  --model REALESRGAN_X4PLUS_UP4X \
  --tile-size 200
```

### Use Specific GPU
```bash
python upscale_service.py image.jpg output.webp \
  --model REALESRGAN_X4PLUS_UP4X \
  --gpu-id 1
```

## 📋 Available Models

### Quick Reference
```
# Anime/Digital Art
REALESRGAN_X4PLUSANIME_UP4X

# General Purpose
REALESRGAN_X4PLUS_UP4X

# Anime Specialized
WAIFU2X_ANIME_UP2X
WAIFU2X_CUNET_UP2X

# Photo
WAIFU2X_PHOTO_UP2X
REALSR_DF2K_UP4X

# High Quality
REALCUGAN_PRO_UP2X
REALCUGAN_PRO_UP3X
```

For complete model list, see `UPSCALE_UPGRADE.md`

## 🔍 Check GPU Status
```bash
python -c "from sr_vulkan import sr_vulkan as sr; sr.init(); print(sr.getGpuInfo())"
```

## 🐛 Troubleshooting

### Python not found
```bash
# Use python3 instead
python3 upscale_service.py input.jpg output.webp
```

### sr_vulkan not installed
```bash
pip install sr-vulkan -v
```

### GPU not detected
```bash
# Falls back to CPU automatically
# Or specify CPU mode if needed
```

### Out of memory
```bash
# Reduce tile size
--tile-size 200
```

## 📊 Performance Tips

1. **GPU Mode**: 2-3x faster than CPU
2. **Tile Size**: Smaller = less memory, larger = better quality
3. **TTA Mode**: Better quality but slower
4. **Batch Processing**: Process multiple images for efficiency

## 🎯 Integration with NeoView

The upscaling is automatically integrated into the Tauri application:
- No manual script execution needed
- Automatic model selection
- Caching of upscaled images
- Progress tracking

## 📚 Full Documentation

See `UPSCALE_UPGRADE.md` for:
- Detailed model reference
- Advanced configuration
- Architecture overview
- Development notes

## ✅ Verification

Test that everything works:
```bash
# 1. Check Python
python --version

# 2. Check sr_vulkan
python -c "from sr_vulkan import sr_vulkan; print('OK')"

# 3. Check models
python -c "from sr_vulkan import sr_vulkan as sr; sr.init(); print(sr.getGpuInfo())"

# 4. Test upscaling
python upscale_service.py test.jpg output.webp
```

## 🚀 Next Steps

1. ✅ Install dependencies
2. ✅ Verify installation
3. ✅ Test with sample image
4. ✅ Integrate with NeoView
5. ✅ Enjoy faster upscaling!

---

**Need Help?** Check `UPSCALE_UPGRADE.md` for detailed troubleshooting.
