#!/bin/bash

# NeoView 缩略图预处理器
# 用法: ./preprocess_thumbnails.sh <路径> [选项]
#
# 参数:
#   <路径>    要处理的目录路径
#
# 选项:
#   --size <尺寸>    缩略图最大尺寸 (默认: 256)
#   --recursive      递归处理子目录
#   --verbose        显示详细进度
#   --help           显示此帮助信息

show_help() {
    cat << EOF
NeoView 缩略图预处理器

用法: $0 <路径> [选项]

参数:
  <路径>          要处理的目录路径

选项:
  --size <尺寸>    缩略图最大尺寸 (默认: 256)
  --recursive      递归处理子目录
  --verbose        显示详细进度
  --help           显示此帮助信息

示例:
  $0 "/home/user/Images" --recursive --verbose
  $0 "/home/user/Comics" --size 128

EOF
}

if [ $# -eq 0 ] || [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    show_help
    exit 0
fi

TARGET_PATH="$1"
SIZE=256
RECURSIVE=""
VERBOSE=""

shift

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
        *)
            echo "未知选项: $1"
            show_help
            exit 1
            ;;
    esac
done

echo "开始预处理缩略图..."
echo "路径: $TARGET_PATH"
echo "尺寸: ${SIZE}x$SIZE"
[ -n "$RECURSIVE" ] && echo "递归处理: 是"
[ -n "$VERBOSE" ] && echo "详细输出: 是"

cd "$(dirname "$0")/src-tauri"
cargo run --release -- preprocess --path "$TARGET_PATH" --size $SIZE $RECURSIVE $VERBOSE