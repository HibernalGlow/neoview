/**
 * 超分设置功能测试脚本
 * 在浏览器控制台中运行此脚本来测试所有功能
 */

// 测试函数
async function testUpscaleSettings() {
    console.log('🧪 开始测试超分设置功能...');
    
    try {
        // 1. 测试初始化
        console.log('1️⃣ 测试初始化...');
        if (typeof window.initUpscaleSettingsManager === 'function') {
            await window.initUpscaleSettingsManager();
            console.log('✅ 初始化成功');
        } else {
            console.error('❌ initUpscaleSettingsManager 函数未找到');
        }
        
        // 2. 测试切换算法
        console.log('2️⃣ 测试切换算法...');
        if (typeof window.switchAlgorithm === 'function') {
            window.switchAlgorithm('realesrgan');
            console.log('✅ 算法切换成功');
        } else {
            console.error('❌ switchAlgorithm 函数未找到');
        }
        
        // 3. 测试更新算法设置
        console.log('3️⃣ 测试更新算法设置...');
        if (typeof window.updateCurrentAlgorithmSettings === 'function') {
            window.updateCurrentAlgorithmSettings({ 
                scale: '2', 
                tta: true,
                gpu_id: '1'
            });
            console.log('✅ 算法设置更新成功');
        } else {
            console.error('❌ updateCurrentAlgorithmSettings 函数未找到');
        }
        
        // 4. 测试保存设置
        console.log('4️⃣ 测试保存设置...');
        if (typeof window.saveUpscaleSettings === 'function') {
            await window.saveUpscaleSettings();
            console.log('✅ 设置保存成功');
        } else {
            console.error('❌ saveUpscaleSettings 函数未找到');
        }
        
        // 5. 测试设置预加载页数
        console.log('5️⃣ 测试设置预加载页数...');
        if (typeof window.setPreloadPages === 'function') {
            await window.setPreloadPages(5);
            console.log('✅ 预加载页数设置成功');
        } else {
            console.error('❌ setPreloadPages 函数未找到');
        }
        
        // 6. 测试条件超分设置
        console.log('6️⃣ 测试条件超分设置...');
        if (typeof window.updateConditionalUpscaleSettings === 'function') {
            const conditionalSettings = {
                enabled: true,
                min_width: 500,
                min_height: 500,
                max_width: 2000,
                max_height: 2000,
                aspect_ratio_condition: null
            };
            await window.updateConditionalUpscaleSettings(conditionalSettings);
            console.log('✅ 条件超分设置更新成功');
        } else {
            console.error('❌ updateConditionalUpscaleSettings 函数未找到');
        }
        
        // 7. 测试重置设置
        console.log('7️⃣ 测试重置设置...');
        if (typeof window.resetUpscaleSettings === 'function') {
            await window.resetUpscaleSettings();
            console.log('✅ 设置重置成功');
        } else {
            console.error('❌ resetUpscaleSettings 函数未找到');
        }
        
        console.log('🎉 所有测试完成！');
        
    } catch (error) {
        console.error('❌ 测试过程中出现错误:', error);
    }
}

// 将测试函数添加到全局对象
window.testUpscaleSettings = testUpscaleSettings;

// 输出使用说明
console.log('💡 超分设置测试脚本已加载');
console.log('💡 在浏览器控制台中运行 testUpscaleSettings() 来测试所有功能');
console.log('💡 或者单独运行以下函数:');
console.log('   - initUpscaleSettingsManager()');
console.log('   - switchAlgorithm(algorithm)');
console.log('   - updateCurrentAlgorithmSettings(settings)');
console.log('   - saveUpscaleSettings()');
console.log('   - setPreloadPages(pages)');
console.log('   - updateConditionalUpscaleSettings(settings)');
console.log('   - resetUpscaleSettings()');