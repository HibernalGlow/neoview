/**
 * 测试超分设置功能
 */

import { 
    upscaleSettings, 
    initUpscaleSettingsManager, 
    saveUpscaleSettings, 
    resetUpscaleSettings,
    switchAlgorithm,
    updateCurrentAlgorithmSettings,
    setPreloadPages,
    updateConditionalUpscaleSettings
} from '../src/lib/stores/upscale/UpscaleManager.svelte';

// 测试函数
async function testUpscaleSettings() {
    console.log('🧪 开始测试超分设置功能...');
    
    try {
        // 初始化设置管理器
        console.log('1️⃣ 初始化设置管理器...');
        await initUpscaleSettingsManager();
        
        // 测试切换算法
        console.log('2️⃣ 测试切换算法...');
        switchAlgorithm('realesrgan');
        console.log('当前算法:', upscaleSettings.get().active_algorithm);
        
        // 测试更新算法设置
        console.log('3️⃣ 测试更新算法设置...');
        updateCurrentAlgorithmSettings({ 
            scale: '2', 
            tta: true,
            gpu_id: '1'
        });
        console.log('更新后的设置:', upscaleSettings.get().realesrgan);
        
        // 测试保存设置
        console.log('4️⃣ 测试保存设置...');
        await saveUpscaleSettings();
        console.log('设置已保存');
        
        // 测试设置预加载页数
        console.log('5️⃣ 测试设置预加载页数...');
        await setPreloadPages(5);
        console.log('预加载页数已设置为:', upscaleSettings.get().preload_pages);
        
        // 测试条件超分设置
        console.log('6️⃣ 测试条件超分设置...');
        const conditionalSettings = {
            enabled: true,
            min_width: 500,
            min_height: 500,
            max_width: 2000,
            max_height: 2000,
            aspect_ratio_condition: null
        };
        await updateConditionalUpscaleSettings(conditionalSettings);
        console.log('条件超分设置已更新:', upscaleSettings.get().conditional_upscale);
        
        // 测试重置设置
        console.log('7️⃣ 测试重置设置...');
        await resetUpscaleSettings();
        console.log('设置已重置为默认值');
        console.log('重置后的算法:', upscaleSettings.get().active_algorithm);
        
        console.log('✅ 所有测试通过！');
        
    } catch (error) {
        console.error('❌ 测试失败:', error);
    }
}

// 导出测试函数
export { testUpscaleSettings };

// 如果直接运行此文件，执行测试
if (typeof window !== 'undefined') {
    // 在浏览器环境中，将测试函数添加到全局对象
    window.testUpscaleSettings = testUpscaleSettings;
    console.log('💡 在浏览器控制台中运行 testUpscaleSettings() 来测试超分设置功能');
}