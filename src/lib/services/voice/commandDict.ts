/**
 * 中文语音命令词典
 * 将语音识别的自然语言映射到操作ID
 */

// 命令词典：action -> 可接受的中文命令数组
export const VOICE_COMMANDS: Record<string, string[]> = {
	// === 导航操作 ===
	nextPage: ['下一页', '翻页', '下一张', '往后翻', '后面'],
	prevPage: ['上一页', '前一页', '上一张', '往前翻', '前面'],
	firstPage: ['第一页', '首页', '开头', '最前面'],
	lastPage: ['最后一页', '末页', '结尾', '最后面'],
	pageLeft: ['向左翻页', '左翻', '往左'],
	pageRight: ['向右翻页', '右翻', '往右'],
	nextBook: ['下一本书', '下一个文件夹', '下一本', '后一本'],
	prevBook: ['上一本书', '上一个文件夹', '上一本', '前一本'],

	// === 缩放操作 ===
	zoomIn: ['放大', '看大一点', '大一点', '放大图片'],
	zoomOut: ['缩小', '看小一点', '小一点', '缩小图片'],
	fitWindow: ['适应窗口', '自动大小', '适应屏幕', '自适应'],
	actualSize: ['实际大小', '原始大小', '一比一', '百分百'],
	toggleTemporaryFitZoom: ['临时适应', '临时放大', '临时缩放'],

	// === 视图操作 ===
	fullscreen: ['全屏', '退出全屏', '全屏模式', '满屏'],
	toggleLeftSidebar: ['侧边栏', '左侧边栏', '目录', '显示目录', '隐藏目录'],
	toggleRightSidebar: ['右侧边栏', '信息面板', '属性面板'],
	toggleTopToolbarPin: ['固定工具栏', '工具栏'],
	toggleBottomThumbnailBarPin: ['固定缩略图', '缩略图栏'],
	toggleReadingDirection: ['阅读方向', '切换方向', '左开右开'],
	toggleBookMode: ['书籍模式', '双页模式', '单页模式', '切换页面模式'],
	rotate: ['旋转', '旋转图片', '转一下'],
	toggleSinglePanoramaView: ['单页切换', '单页视图'],

	// === 文件操作 ===
	openFile: ['打开文件', '打开', '选择文件'],
	closeFile: ['关闭文件', '关闭', '关掉'],
	deleteFile: ['删除文件', '删除', '删掉'],
	deleteCurrentPage: ['删除当前页', '删除这页'],

	// === 视频操作 ===
	videoPlayPause: ['播放', '暂停', '开始播放', '停止播放', '继续'],
	videoSeekForward: ['快进', '向前跳', '快进十秒'],
	videoSeekBackward: ['快退', '向后跳', '快退十秒'],
	videoToggleMute: ['静音', '取消静音', '声音开关'],
	videoToggleLoopMode: ['循环模式', '单曲循环', '列表循环'],
	videoVolumeUp: ['音量增加', '大声一点', '声音大一点'],
	videoVolumeDown: ['音量降低', '小声一点', '声音小一点'],
	videoSpeedUp: ['加速', '快一点', '倍速增加'],
	videoSpeedDown: ['减速', '慢一点', '倍速降低'],
	videoSpeedToggle: ['倍速切换', '原速', '正常速度'],
	videoSeekModeToggle: ['快进模式', '快进模式切换'],

	// === 超分操作 ===
	toggleAutoUpscale: ['自动超分', '超分开关', '开启超分', '关闭超分'],
};

// 反向映射：命令短语 -> action
const phraseToActionMap = new Map<string, string>();
for (const [action, phrases] of Object.entries(VOICE_COMMANDS)) {
	for (const phrase of phrases) {
		phraseToActionMap.set(phrase.toLowerCase(), action);
	}
}

/**
 * 查找匹配的操作
 * @param transcript 语音识别的文本
 * @returns 匹配结果或null
 */
export function findMatchingAction(transcript: string): { action: string; matchedPhrase: string } | null {
	const normalizedTranscript = transcript.toLowerCase().trim();
	
	// 1. 精确匹配
	if (phraseToActionMap.has(normalizedTranscript)) {
		return {
			action: phraseToActionMap.get(normalizedTranscript)!,
			matchedPhrase: transcript,
		};
	}
	
	// 2. 包含匹配（检查识别文本中是否包含命令短语）
	for (const [phrase, action] of phraseToActionMap) {
		if (normalizedTranscript.includes(phrase)) {
			return { action, matchedPhrase: phrase };
		}
	}
	
	// 3. 模糊匹配（检查命令短语是否包含在识别文本中）
	for (const [phrase, action] of phraseToActionMap) {
		// 去除标点和空格后比较
		const cleanTranscript = normalizedTranscript.replace(/[，。、！？\s]/g, '');
		const cleanPhrase = phrase.replace(/[，。、！？\s]/g, '');
		if (cleanTranscript.includes(cleanPhrase) || cleanPhrase.includes(cleanTranscript)) {
			return { action, matchedPhrase: phrase };
		}
	}
	
	return null;
}

/**
 * 获取操作对应的所有命令短语
 */
export function getPhrasesForAction(action: string): string[] {
	return VOICE_COMMANDS[action] || [];
}

/**
 * 获取所有支持的操作
 */
export function getAllSupportedActions(): string[] {
	return Object.keys(VOICE_COMMANDS);
}

/**
 * 检查操作是否支持语音控制
 */
export function isActionSupported(action: string): boolean {
	return action in VOICE_COMMANDS;
}
