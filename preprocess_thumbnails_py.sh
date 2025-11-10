#!/bin/bash
# NeoView 缩略图预处理器 (Python版本)
# 用法: ./preprocess_thumbnails_py.sh <路径> [选项]
#
# 参数:
#   <路径>    要处理的目录路径
#
# 选项:
#   --size <尺寸>    缩略图最大尺寸 (默认: 256)
#   --recursive      递归处理子目录
#   --verbose        显示详细进度
#   --cache-dir <路径> 缓存目录路径
#   --help           显示此帮助信息

show_help() {
    echo
    echo "NeoView 缩略图预处理器 (Python版本)"
    echo
    echo "用法: $0 <路径> [选项]"
    echo
    echo "参数:"
    echo "  <路径>          要处理的目录路径"
    echo
    echo "选项:"
    echo "  --size <尺寸>    缩略图最大尺寸 (默认: 256)"
    echo "  --recursive       递归处理子目录"
    echo "  --verbose         显示详细进度"
    echo "  --cache-dir <路径> 缓存目录路径"
    echo "  --help            显示此帮助信息"
    echo
    echo "示例:"
    echo "  $0 \"/home/user/Images\" --recursive --verbose"
    echo "  $0 \"/home/user/Comics\" --size 128 --cache-dir \"/tmp/cache\""
    echo
}

# 检查参数
if [ $# -eq 0 ] || [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    show_help
    exit 0
fi

TARGET_PATH="$1"
SIZE=256
RECURSIVE=""
VERBOSE=""
CACHE_DIR=""

shift

# 解析参数
while [ $# -gt 0 ]; do
    case $1 in
        --size)
            SIZE="$2"
            shift 2
            ;;
        --recursive)
            RECURSIVE="--recursive"
            shift
            ;;
        --verbose)
            VERBOSE="--verbose"
            shift
            ;;
        --cache-dir)
            CACHE_DIR="--cache-dir \"$2\""
            shift 2
            ;;
        *)
            echo "未知选项: $1"
            show_help
            exit 1
            ;;
    esac
done

echo "NeoView 缩略图预处理器 (Python版本)"
echo "开始预处理缩略图..."
echo "路径: $TARGET_PATH"
echo "尺寸: ${SIZE}x${SIZE}"
[ -n "$RECURSIVE" ] && echo "递归处理: 是"
[ -n "$VERBOSE" ] && echo "详细输出: 是"
[ -n "$CACHE_DIR" ] && echo "缓存目录: $CACHE_DIR"

# 检查Python是否可用
if ! command -v python3 &> /dev/null && ! command -v python &> /dev/null; then
    echo "错误: 未找到Python。请安装Python 3.6或更高版本。"
    exit 1
fi

# 优先使用python3，否则使用python
PYTHON_CMD="python3"
if ! command -v python3 &> /dev/null; then
    PYTHON_CMD="python"
fi

# 检查脚本是否存在
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_PATH="$SCRIPT_DIR/thumbnail_preprocessor.py"

if [ ! -f "$SCRIPT_PATH" ]; then
    echo "错误: 找不到脚本文件 $SCRIPT_PATH"
    exit 1
fi

# 运行Python脚本
eval "$PYTHON_CMD \"$SCRIPT_PATH\" \"$TARGET_PATH\" --size $SIZE $RECURSIVE $VERBOSE $CACHE_DIR"