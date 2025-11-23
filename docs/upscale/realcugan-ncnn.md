Usages
Example Command
realcugan-ncnn-vulkan.exe -i input.jpg -o output.png
Full Usages
Usage: realcugan-ncnn-vulkan -i infile -o outfile [options]...

  -h                   show this help
  -v                   verbose output
  -i input-path        input image path (jpg/png/webp) or directory
  -o output-path       output image path (jpg/png/webp) or directory
  -n noise-level       denoise level (-1/0/1/2/3, default=-1)
  -s scale             upscale ratio (1/2/3/4, default=2)
  -t tile-size         tile size (>=32/0=auto, default=0) can be 0,0,0 for multi-gpu
  -c syncgap-mode      sync gap mode (0/1/2/3, default=3)
  -m model-path        realcugan model path (default=models-se)
  -g gpu-id            gpu device to use (-1=cpu, default=auto) can be 0,1,2 for multi-gpu
  -j load:proc:save    thread count for load/proc/save (default=1:2:2) can be 1:2,2,2:2 for multi-gpu
  -x                   enable tta mode
  -f format            output image format (jpg/png/webp, default=ext/png)
input-path and output-path accept either file path or directory path
noise-level = noise level, large value means strong denoise effect, -1 = no effect
scale = scale level, 1 = no scaling, 2 = upscale 2x
tile-size = tile size, use smaller value to reduce GPU memory usage, default selects automatically
syncgap-mode = sync gap mode, 0 = no sync, 1 = accurate sync, 2 = rough sync, 3 = very rough sync
load:proc:save = thread count for the three stages (image decoding + realcugan upscaling + image encoding), using larger values may increase GPU usage and consume more GPU memory. You can tune this configuration with "4:4:4" for many small-size images, and "2:2:2" for large-size images. The default setting usually works fine for most situations. If you find that your GPU is hungry, try increasing thread count to achieve faster processing.
format = the format of the image to be output, png is better supported, however webp generally yields smaller file sizes, both are losslessly encoded
If you encounter a crash or error, try upgrading your GPU driver:

Intel: https://downloadcenter.intel.com/product/80939/Graphics-Drivers
AMD: https://www.amd.com/en/support
NVIDIA: https://www.nvidia.com/Download/index.aspx