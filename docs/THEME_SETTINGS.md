# 主题设置功能说明

## ✨ 功能特性

### 1. 主题模式切换
支持三种主题模式:
- **浅色模式**: 明亮的界面,适合白天使用
- **深色模式**: 暗色界面,适合夜间使用
- **跟随系统**: 自动跟随操作系统的主题设置

### 2. 预设配色方案
提供 4 个精心设计的配色方案:
- **Amethyst Haze** (紫罗兰薄雾) - 优雅的紫色调
- **Ocean Breeze** (海洋微风) - 清新的蓝色调
- **Forest Mist** (森林薄雾) - 自然的绿色调
- **Sunset Glow** (日落余晖) - 温暖的橙色调

### 3. 实时预览
- 颜色预览卡片实时显示当前主题效果
- 配色方案卡片显示浅色和深色模式的主色预览

### 4. 自动保存
- 主题设置自动保存到 localStorage
- 下次打开应用时自动应用上次的设置

## 🎨 使用方法

### 切换主题模式
1. 打开设置窗口
2. 点击"外观"标签
3. 在"主题模式"区域选择:
   - 点击"浅色"图标 → 切换到浅色模式
   - 点击"深色"图标 → 切换到深色模式
   - 点击"跟随系统"图标 → 自动跟随系统设置

### 选择配色方案
1. 在"配色方案"区域浏览可用的主题
2. 点击任意主题卡片即可应用
3. 当前选中的主题会显示勾选标记

### 查看效果
- 主题会立即应用到整个应用
- 在"颜色预览"区域可以看到主要颜色的效果

## 🔧 技术实现

### 核心功能

#### 1. 主题切换
```typescript
function applyTheme(mode: ThemeMode, theme: PresetTheme) {
  const root = document.documentElement;
  const isDark = mode === 'dark' || (mode === 'system' && systemPrefersDark);
  
  // 切换 dark class
  root.classList.toggle('dark', isDark);
  
  // 应用 CSS 变量
  const colors = isDark ? theme.colors.dark : theme.colors.light;
  root.style.setProperty('--primary', colors.primary);
  root.style.setProperty('--background', colors.background);
  root.style.setProperty('--foreground', colors.foreground);
}
```

#### 2. 系统主题检测
```typescript
const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
mediaQuery.addEventListener('change', (e) => {
  systemPrefersDark = e.matches;
  if (currentMode === 'system') {
    applyTheme('system', selectedTheme);
  }
});
```

#### 3. 持久化存储
```typescript
// 保存
localStorage.setItem('theme-mode', mode);
localStorage.setItem('theme-name', theme.name);

// 加载
const savedMode = localStorage.getItem('theme-mode');
const savedThemeName = localStorage.getItem('theme-name');
```

### 颜色系统

使用 OKLCH 颜色空间,提供更好的感知均匀性:
```typescript
{
  light: {
    primary: 'oklch(0.5569 0.2403 293.3426)',
    background: 'oklch(0.9777 0.0041 301.4256)',
    foreground: 'oklch(0.3651 0.0325 287.0807)'
  },
  dark: {
    primary: 'oklch(0.7137 0.2210 293.5570)',
    background: 'oklch(0.2166 0.0215 292.8474)',
    foreground: 'oklch(0.9053 0.0245 293.5570)'
  }
}
```

## 📝 自定义主题

### 添加新的配色方案

在 `ThemePanel.svelte` 中的 `presetThemes` 数组添加新主题:

```typescript
{
  name: '你的主题名称',
  description: '主题描述',
  colors: {
    light: {
      primary: 'oklch(...)',
      background: 'oklch(...)',
      foreground: 'oklch(...)'
    },
    dark: {
      primary: 'oklch(...)',
      background: 'oklch(...)',
      foreground: 'oklch(...)'
    }
  }
}
```

### OKLCH 颜色格式

- **L** (Lightness): 0-1, 亮度
- **C** (Chroma): 0-0.4, 色度/饱和度
- **H** (Hue): 0-360, 色相角度

示例:
- 紫色: `oklch(0.7 0.2 293)`
- 蓝色: `oklch(0.7 0.2 240)`
- 绿色: `oklch(0.7 0.2 140)`
- 橙色: `oklch(0.7 0.2 40)`

## 🎯 最佳实践

1. **选择合适的模式**:
   - 长时间使用建议选择"跟随系统"
   - 夜间使用建议选择"深色模式"

2. **配色方案选择**:
   - 根据个人喜好选择
   - 不同配色方案适合不同的使用场景

3. **性能考虑**:
   - 主题切换是即时的,不会影响性能
   - 使用 CSS 变量,无需重新加载页面

## 🐛 故障排除

### 主题没有保存
- 检查浏览器是否允许 localStorage
- 清除浏览器缓存后重试

### 跟随系统不工作
- 确保操作系统支持深色模式
- 检查浏览器是否支持 `prefers-color-scheme`

### 颜色显示异常
- 确保浏览器支持 OKLCH 颜色空间
- 现代浏览器(Chrome 111+, Firefox 113+)都支持
