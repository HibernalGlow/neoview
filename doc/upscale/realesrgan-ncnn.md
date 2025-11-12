💻 Usages
Example Command
realesrgan-ncnn-vulkan.exe -i input.jpg -o output.png -n realesr-animevideov3 -s 2
Full Usages
Usage: realesrgan-ncnn-vulkan.exe -i infile -o outfile [options]...

  -h                   show this help"
  -i input-path        input image path (jpg/png/webp) or directory"
  -o output-path       output image path (jpg/png/webp) or directory"
  -s scale             upscale ratio (can be 2, 3, 4. default=4)"
  -t tile-size         tile size (>=32/0=auto, default=0) can be 0,0,0 for multi-gpu"
  -m model-path        folder path to the pre-trained models. default=models"
  -n model-name        model name (default=realesr-animevideov3, can be realesr-animevideov3 | realesrgan-x4plus | realesrgan-x4plus-anime | realesrnet-x4plus)"
  -g gpu-id            gpu device to use (default=auto) can be 0,1,2 for multi-gpu"
  -j load:proc:save    thread count for load/proc/save (default=1:2:2) can be 1:2,2,2:2 for multi-gpu"
  -x                   enable tta mode"
  -f format            output image format (jpg/png/webp, default=ext/png)"
  -v                   verbose output"
input-path and output-path accept either file path or directory path
scale = scale level
tile-size = tile size, use smaller value to reduce GPU memory usage, default selects automatically
load:proc:save = thread count for the three stages (image decoding + model upscaling + image encoding), using larger values may increase GPU usage and consume more GPU memory. You can tune this configuration with "4:4:4" for many small-size images, and "2:2:2" for large-size images. The default setting usually works fine for most situations. If you find that your GPU is hungry, try increasing thread count to achieve faster processing.
format = the format of the image to be output, png is better supported, however webp generally yields smaller file sizes, both are losslessly encoded
If you encounter crash or error, try to upgrade your GPU driver

Intel: https://downloadcenter.intel.com/product/80939/Graphics-Drivers
AMD: https://www.amd.com/en/support
NVIDIA: https://www.nvidia.com/Download/index.aspx