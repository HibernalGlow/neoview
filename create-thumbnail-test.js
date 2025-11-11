// 测试缩略图修复的Node.js脚本
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';

console.log('开始测试缩略图修复...');

// 创建一个简单的HTML文件来测试缩略图功能
const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <title>缩略图测试</title>
</head>
<body>
    <h1>缩略图测试</h1>
    <button onclick="testThumbnail()">测试缩略图</button>
    <div id="result"></div>
    
    <script>
        async function testThumbnail() {
            const resultDiv = document.getElementById('result');
            resultDiv.innerHTML = '测试中...';
            
            try {
                // 初始化缩略图管理器
                const testRootPath = 'D:\\1VSCODE\\Projects\\ImageAll\\NeeWaifu\\neoview\\neoview-tauri';
                const thumbnailPath = 'D:\\temp\\neoview_thumbnails_test';
                
                await window.__TAURI__.invoke('init_thumbnail_manager', {
                    thumbnailPath: thumbnailPath,
                    rootPath: testRootPath,
                    size: 256
                });
                
                // 测试图片路径
                const testImagePath = 'D:\\1VSCODE\\Projects\\ImageAll\\NeeWaifu\\neoview\\neoview-tauri\\temp\\test_images\\test_image.png';
                
                // 生成缩略图
                const thumbnailUrl = await window.__TAURI__.invoke('generate_file_thumbnail_new', {
                    filePath: testImagePath
                });
                console.log('缩略图生成成功:', thumbnailUrl);
                
                // 获取缩略图信息
                const thumbnailInfo = await window.__TAURI__.invoke('get_thumbnail_info', {
                    filePath: testImagePath
                });
                console.log('缩略图信息:', thumbnailInfo);
                
                if (thumbnailInfo) {
                    resultDiv.innerHTML = '✅ 测试成功！缩略图信息获取正常<br>' + 
                                        '缩略图URL: ' + thumbnailInfo.url + '<br>' +
                                        '尺寸: ' + thumbnailInfo.width + 'x' + thumbnailInfo.height;
                } else {
                    resultDiv.innerHTML = '❌ 测试失败！无法获取缩略图信息';
                }
                
            } catch (error) {
                console.error('测试失败:', error);
                resultDiv.innerHTML = '❌ 测试失败: ' + error;
            }
        }
    </script>
</body>
</html>
`;

// 写入HTML文件
fs.writeFileSync('test-thumbnail.html', htmlContent);
console.log('测试HTML文件已创建: test-thumbnail.html');
console.log('请在浏览器中打开此文件并点击"测试缩略图"按钮');