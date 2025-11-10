@echo off
REM NeoView 缩略图预处理器
REM 用法: preprocess_thumbnails.bat <路径> [选项]
REM
REM 参数:
REM   <路径>    要处理的目录路径
REM
REM 选项:
REM   --size <尺寸>    缩略图最大尺寸 (默认: 256)
REM   --recursive      递归处理子目录
REM   --verbose        显示详细进度
REM   --help           显示此帮助信息

if "%~1"=="" goto :show_help
if "%~1"=="--help" goto :show_help
if "%~1"=="-h" goto :show_help

set "TARGET_PATH=%~1"
set "SIZE=256"
set "RECURSIVE="
set "VERBOSE="

shift

:parse_args
if "%~1"=="" goto :run
if "%~1"=="--size" (
    set "SIZE=%~2"
    shift
    shift
    goto :parse_args
)
if "%~1"=="--recursive" (
    set "RECURSIVE=--recursive"
    shift
    goto :parse_args
)
if "%~1"=="--verbose" (
    set "VERBOSE=--verbose"
    shift
    goto :parse_args
)
echo 未知选项: %~1
goto :show_help

:run
echo 开始预处理缩略图...
echo 路径: %TARGET_PATH%
echo 尺寸: %SIZE%x%SIZE%
if defined RECURSIVE echo 递归处理: 是
if defined VERBOSE echo 详细输出: 是

cd /d "%~dp0src-tauri"
cargo run --release -- preprocess --path "%TARGET_PATH%" --size %SIZE% %RECURSIVE% %VERBOSE%
goto :end

:show_help
echo.
echo NeoView 缩略图预处理器
echo.
echo 用法: preprocess_thumbnails.bat ^<路径^> [选项]
echo.
echo 参数:
echo   ^<路径^>          要处理的目录路径
echo.
echo 选项:
echo   --size ^<尺寸^>    缩略图最大尺寸 (默认: 256)
echo   --recursive       递归处理子目录
echo   --verbose         显示详细进度
echo   --help            显示此帮助信息
echo.
echo 示例:
echo   preprocess_thumbnails.bat "D:\Images" --recursive --verbose
echo   preprocess_thumbnails.bat "D:\Comics" --size 128
echo.
goto :end

:end