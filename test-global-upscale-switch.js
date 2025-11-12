/**
 * 全局超分开关功能测试
 * 在浏览器控制台中运行此脚本来测试全局开关功能
 */

// 测试函数
async function testGlobalUpscaleSwitch() {
    console.log('🧪 开始测试全局超分开关功能...');
    
    try {
        // 1. 获取当前全局开关状态
        console.log('1️⃣ 获取当前全局开关状态...');
        const currentState = await window.getGlobalUpscaleEnabled?.();
        console.log('当前全局开关状态:', currentState);
        
        // 2. 测试关闭全局开关
        console.log('2️⃣ 测试关闭全局开关...');
        await window.setGlobalUpscaleEnabled?.(false);
        console.log('全局开关已关闭');
        
        // 3. 验证开关状态
        const newState = await window.getGlobalUpscaleEnabled?.();
        console.log('验证开关状态:', newState);
        
        // 4. 测试开启全局开关
        console.log('3️⃣ 测试开启全局开关...');
        await window.setGlobalUpscaleEnabled?.(true);
        console.log('全局开关已开启');
        
        // 5. 再次验证开关状态
        const finalState = await window.getGlobalUpscaleEnabled?.();
        console.log('最终开关状态:', finalState);
        
        console.log('✅ 全局超分开关功能测试完成！');
        
    } catch (error) {
        console.error('❌ 测试过程中出现错误:', error);
    }
}

// 测试超分功能在全局开关关闭时的行为
async function testUpscaleWithGlobalSwitch() {
    console.log('🧪 测试超分功能在全局开关控制下的行为...');
    
    try {
        // 1. 确保有当前图片
        if (!window.bookStore?.currentImage) {
            console.log('⚠️ 没有当前图片，跳过超分测试');
            return;
        }
        
        // 2. 关闭全局开关
        console.log('1️⃣ 关闭全局开关...');
        await window.setGlobalUpscaleEnabled?.(false);
        
        // 3. 尝试执行超分
        console.log('2️⃣ 尝试执行超分（应该被阻止）...');
        await window.performUpscale?.('test-image-data');
        
        // 4. 开启全局开关
        console.log('3️⃣ 开启全局开关...');
        await window.setGlobalUpscaleEnabled?.(true);
        
        // 5. 再次尝试执行超分
        console.log('4️⃣ 再次尝试执行超分（应该被允许）...');
        await window.performUpscale?.('test-image-data');
        
        console.log('✅ 超分功能控制测试完成！');
        
    } catch (error) {
        console.error('❌ 测试过程中出现错误:', error);
    }
}

// 测试条件超分与全局开关的交互
async function testConditionalUpscaleInteraction() {
    console.log('🧪 测试条件超分与全局开关的交互...');
    
    try {
        // 1. 设置条件超分（最小宽度1000px）
        console.log('1️⃣ 设置条件超分（最小宽度1000px）...');
        await window.updateConditionalUpscaleSettings?.({
            enabled: true,
            min_width: 1000,
            min_height: 1000,
            max_width: 0,
            max_height: 0,
            aspect_ratio_condition: null
        });
        
        // 2. 关闭全局开关
        console.log('2️⃣ 关闭全局开关...');
        await window.setGlobalUpscaleEnabled?.(false);
        
        // 3. 检查图片是否满足超分条件
        console.log('3️⃣ 检查图片是否满足超分条件...');
        const shouldUpscale = await window.checkUpscaleConditions?.(800, 600);
        console.log('800x600图片是否满足条件超分:', shouldUpscale);
        
        // 4. 开启全局开关
        console.log('4️⃣ 开启全局开关...');
        await window.setGlobalUpscaleEnabled?.(true);
        
        // 5. 再次检查
        const shouldUpscaleAfter = await window.checkUpscaleConditions?.(800, 600);
        console.log('开启全局开关后800x600图片是否满足条件超分:', shouldUpscaleAfter);
        
        console.log('✅ 条件超分与全局开关交互测试完成！');
        
    } catch (error) {
        console.error('❌ 测试过程中出现错误:', error);
    }
}

// 导出测试函数
window.testGlobalUpscaleSwitch = testGlobalUpscaleSwitch;
window.testUpscaleWithGlobalSwitch = testUpscaleWithGlobalSwitch;
window.testConditionalUpscaleInteraction = testConditionalUpscaleInteraction;

// 输出使用说明
console.log('💡 全局超分开关测试脚本已加载');
console.log('💡 在浏览器控制台中运行以下函数来测试功能:');
console.log('   - testGlobalUpscaleSwitch() - 测试全局开关基本功能');
console.log('   - testUpscaleWithGlobalSwitch() - 测试超分功能在全局开关控制下的行为');
console.log('   - testConditionalUpscaleInteraction() - 测试条件超分与全局开关的交互');