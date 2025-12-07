/**
 * 字幕工具函数 - SRT 和 ASS 字幕支持
 */

// 支持的字幕扩展名
export const SUBTITLE_EXTENSIONS = ['.srt', '.ass', '.ssa', '.vtt'];

/**
 * 检查是否为字幕文件
 */
export function isSubtitleFile(filename: string): boolean {
	if (!filename) return false;
	const lowerName = filename.toLowerCase();
	return SUBTITLE_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
}

/**
 * 获取字幕文件类型
 */
export function getSubtitleType(filename: string): 'srt' | 'ass' | 'vtt' | null {
	if (!filename) return null;
	const lowerName = filename.toLowerCase();
	if (lowerName.endsWith('.srt')) return 'srt';
	if (lowerName.endsWith('.ass') || lowerName.endsWith('.ssa')) return 'ass';
	if (lowerName.endsWith('.vtt')) return 'vtt';
	return null;
}

/**
 * 根据视频文件名生成可能的字幕文件名列表
 */
export function getPossibleSubtitleNames(videoFilename: string): string[] {
	if (!videoFilename) return [];

	// 移除视频扩展名
	const lastDotIndex = videoFilename.lastIndexOf('.');
	const baseName = lastDotIndex > 0 ? videoFilename.substring(0, lastDotIndex) : videoFilename;

	// 生成所有可能的字幕文件名
	const names: string[] = [];
	for (const ext of SUBTITLE_EXTENSIONS) {
		names.push(baseName + ext);
		names.push(baseName + ext.toUpperCase());
	}

	return names;
}

/**
 * 将 SRT 格式转换为 VTT 格式
 */
export function srtToVtt(srtContent: string): string {
	// VTT 头部
	let vtt = 'WEBVTT\n\n';

	// 规范化换行符
	const normalized = srtContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

	// 分割字幕块
	const blocks = normalized.split(/\n\n+/);

	for (const block of blocks) {
		const lines = block.trim().split('\n');
		if (lines.length < 2) continue;

		// 跳过序号行（如果存在）
		let timeLineIndex = 0;
		if (/^\d+$/.test(lines[0].trim())) {
			timeLineIndex = 1;
		}

		if (timeLineIndex >= lines.length) continue;

		// 解析时间行
		const timeLine = lines[timeLineIndex];
		const timeMatch = timeLine.match(
			/(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/
		);
		if (!timeMatch) continue;

		// 转换时间格式（SRT 用逗号，VTT 用点）
		const startTime = timeMatch[1].replace(',', '.');
		const endTime = timeMatch[2].replace(',', '.');

		// 获取字幕文本
		const textLines = lines.slice(timeLineIndex + 1);
		const text = textLines.join('\n');

		if (text.trim()) {
			vtt += `${startTime} --> ${endTime}\n${text}\n\n`;
		}
	}

	return vtt;
}

/**
 * ASS 字幕条目
 */
export interface AssSubtitleCue {
	start: number; // 开始时间（秒）
	end: number; // 结束时间（秒）
	text: string; // 字幕文本（已清理格式标签）
	style?: string; // 样式名称
}

/**
 * 解析 ASS 时间戳为秒
 */
function parseAssTime(timeStr: string): number {
	// 格式: 0:00:00.00 或 H:MM:SS.cc
	const match = timeStr.trim().match(/(\d+):(\d{2}):(\d{2})\.(\d{2})/);
	if (!match) return 0;

	const hours = parseInt(match[1], 10);
	const minutes = parseInt(match[2], 10);
	const seconds = parseInt(match[3], 10);
	const centiseconds = parseInt(match[4], 10);

	return hours * 3600 + minutes * 60 + seconds + centiseconds / 100;
}

/**
 * 清理 ASS 格式标签，保留纯文本
 */
function cleanAssText(text: string): string {
	// 移除 ASS 格式标签 {\...}
	let cleaned = text.replace(/\{[^}]*\}/g, '');
	// 转换换行符 \N 和 \n
	cleaned = cleaned.replace(/\\N/g, '\n').replace(/\\n/g, '\n');
	// 移除硬空格
	cleaned = cleaned.replace(/\\h/g, ' ');
	return cleaned.trim();
}

/**
 * 解析 ASS 字幕文件
 */
export function parseAssSubtitles(assContent: string): AssSubtitleCue[] {
	const cues: AssSubtitleCue[] = [];

	// 规范化换行符
	const normalized = assContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
	const lines = normalized.split('\n');

	let inEventsSection = false;
	let formatLine: string[] = [];

	for (const line of lines) {
		const trimmedLine = line.trim();

		// 检测 [Events] 区段
		if (trimmedLine.toLowerCase() === '[events]') {
			inEventsSection = true;
			continue;
		}

		// 检测其他区段开始
		if (trimmedLine.startsWith('[') && trimmedLine.endsWith(']')) {
			inEventsSection = false;
			continue;
		}

		if (!inEventsSection) continue;

		// 解析 Format 行
		if (trimmedLine.toLowerCase().startsWith('format:')) {
			const formatStr = trimmedLine.substring(7).trim();
			formatLine = formatStr.split(',').map((s) => s.trim().toLowerCase());
			continue;
		}

		// 解析 Dialogue 行
		if (trimmedLine.toLowerCase().startsWith('dialogue:')) {
			const dialogueStr = trimmedLine.substring(9).trim();

			// 根据 Format 解析字段（最后一个字段是 Text，可能包含逗号）
			const parts: string[] = [];
			let currentPart = '';
			let partCount = 0;
			const maxParts = formatLine.length || 10;

			for (let i = 0; i < dialogueStr.length; i++) {
				const char = dialogueStr[i];
				if (char === ',' && partCount < maxParts - 1) {
					parts.push(currentPart.trim());
					currentPart = '';
					partCount++;
				} else {
					currentPart += char;
				}
			}
			parts.push(currentPart.trim());

			// 找到各字段的位置
			const startIndex = formatLine.indexOf('start');
			const endIndex = formatLine.indexOf('end');
			const textIndex = formatLine.indexOf('text');
			const styleIndex = formatLine.indexOf('style');

			if (startIndex >= 0 && endIndex >= 0 && textIndex >= 0) {
				const start = parseAssTime(parts[startIndex] || '0:00:00.00');
				const end = parseAssTime(parts[endIndex] || '0:00:00.00');
				const rawText = parts[textIndex] || '';
				const text = cleanAssText(rawText);
				const style = styleIndex >= 0 ? parts[styleIndex] : undefined;

				if (text && end > start) {
					cues.push({ start, end, text, style });
				}
			}
		}
	}

	// 按开始时间排序
	cues.sort((a, b) => a.start - b.start);

	return cues;
}

/**
 * 将 ASS 字幕转换为 VTT 格式（简单转换，不保留样式）
 */
export function assToVtt(assContent: string): string {
	const cues = parseAssSubtitles(assContent);

	let vtt = 'WEBVTT\n\n';

	for (const cue of cues) {
		const startTime = formatVttTime(cue.start);
		const endTime = formatVttTime(cue.end);
		vtt += `${startTime} --> ${endTime}\n${cue.text}\n\n`;
	}

	return vtt;
}

/**
 * 格式化时间为 VTT 格式
 */
function formatVttTime(seconds: number): string {
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const secs = Math.floor(seconds % 60);
	const millis = Math.floor((seconds % 1) * 1000);

	return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
}

/**
 * 字幕数据
 */
export interface SubtitleData {
	type: 'srt' | 'ass' | 'vtt';
	content: string;
	vttContent: string; // 转换后的 VTT 内容（用于 <track>）
	vttUrl?: string; // VTT Blob URL
	assCues?: AssSubtitleCue[]; // ASS 解析后的条目（用于自定义渲染）
}

/**
 * 加载并解析字幕内容
 */
export function parseSubtitleContent(content: string, type: 'srt' | 'ass' | 'vtt'): SubtitleData {
	let vttContent: string;
	let assCues: AssSubtitleCue[] | undefined;

	switch (type) {
		case 'srt':
			vttContent = srtToVtt(content);
			break;
		case 'ass':
			vttContent = assToVtt(content);
			assCues = parseAssSubtitles(content);
			break;
		case 'vtt':
			vttContent = content;
			break;
		default:
			vttContent = content;
	}

	return {
		type,
		content,
		vttContent,
		assCues
	};
}

/**
 * 创建字幕 Blob URL
 */
export function createSubtitleBlobUrl(vttContent: string): string {
	const blob = new Blob([vttContent], { type: 'text/vtt' });
	return URL.createObjectURL(blob);
}

/**
 * 释放字幕 Blob URL
 */
export function revokeSubtitleBlobUrl(url: string | undefined): void {
	if (url) {
		URL.revokeObjectURL(url);
	}
}
