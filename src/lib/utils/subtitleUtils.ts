/**
 * 字幕工具函数 - SRT、ASS、VTT 字幕支持
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
 * 将 SRT 转换为 VTT 格式
 */
function srtToVtt(content: string): string {
	let vtt = 'WEBVTT\n\n';
	const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
	const blocks = normalized.split(/\n\n+/);

	for (const block of blocks) {
		const lines = block.trim().split('\n');
		if (lines.length < 2) continue;

		let timeLineIndex = 0;
		if (/^\d+$/.test(lines[0].trim())) {
			timeLineIndex = 1;
		}
		if (timeLineIndex >= lines.length) continue;

		const timeLine = lines[timeLineIndex];
		const timeMatch = timeLine.match(
			/(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/
		);
		if (!timeMatch) continue;

		const startTime = timeMatch[1].replace(',', '.');
		const endTime = timeMatch[2].replace(',', '.');
		const text = lines.slice(timeLineIndex + 1).join('\n');

		if (text.trim()) {
			vtt += `${startTime} --> ${endTime}\n${text}\n\n`;
		}
	}
	return vtt;
}

/**
 * 解析 ASS 时间戳为秒
 */
function parseAssTime(timeStr: string): number {
	const match = timeStr.trim().match(/(\d+):(\d{2}):(\d{2})\.(\d{2})/);
	if (!match) return 0;
	return (
		parseInt(match[1], 10) * 3600 +
		parseInt(match[2], 10) * 60 +
		parseInt(match[3], 10) +
		parseInt(match[4], 10) / 100
	);
}

/**
 * 清理 ASS 格式标签
 */
function cleanAssText(text: string): string {
	return text
		.replace(/\{[^}]*\}/g, '')
		.replace(/\\N/g, '\n')
		.replace(/\\n/g, '\n')
		.replace(/\\h/g, ' ')
		.trim();
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
 * 将 ASS 字幕转换为 VTT 格式
 */
function assToVtt(assContent: string): string {
	let vtt = 'WEBVTT\n\n';
	const normalized = assContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
	const lines = normalized.split('\n');

	let inEventsSection = false;
	let formatLine: string[] = [];

	for (const line of lines) {
		const trimmed = line.trim();

		if (trimmed.toLowerCase() === '[events]') {
			inEventsSection = true;
			continue;
		}
		if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
			inEventsSection = false;
			continue;
		}
		if (!inEventsSection) continue;

		if (trimmed.toLowerCase().startsWith('format:')) {
			formatLine = trimmed
				.substring(7)
				.split(',')
				.map((s) => s.trim().toLowerCase());
			continue;
		}

		if (trimmed.toLowerCase().startsWith('dialogue:')) {
			const dialogueStr = trimmed.substring(9).trim();
			const parts: string[] = [];
			let currentPart = '';
			let partCount = 0;
			const maxParts = formatLine.length || 10;

			for (const char of dialogueStr) {
				if (char === ',' && partCount < maxParts - 1) {
					parts.push(currentPart.trim());
					currentPart = '';
					partCount++;
				} else {
					currentPart += char;
				}
			}
			parts.push(currentPart.trim());

			const startIdx = formatLine.indexOf('start');
			const endIdx = formatLine.indexOf('end');
			const textIdx = formatLine.indexOf('text');

			if (startIdx >= 0 && endIdx >= 0 && textIdx >= 0) {
				const start = parseAssTime(parts[startIdx] || '0:00:00.00');
				const end = parseAssTime(parts[endIdx] || '0:00:00.00');
				const text = cleanAssText(parts[textIdx] || '');

				if (text && end > start) {
					vtt += `${formatVttTime(start)} --> ${formatVttTime(end)}\n${text}\n\n`;
				}
			}
		}
	}
	return vtt;
}

/**
 * 字幕数据
 */
export interface SubtitleData {
	type: 'srt' | 'ass' | 'vtt';
	filename: string; // 字幕文件名
	vttUrl?: string; // VTT Blob URL
}

/**
 * 解析字幕内容并创建 VTT URL
 */
export function parseSubtitleContent(
	content: string,
	type: 'srt' | 'ass' | 'vtt',
	filename: string
): SubtitleData {
	let vttContent: string;

	switch (type) {
		case 'srt':
			vttContent = srtToVtt(content);
			break;
		case 'ass':
			vttContent = assToVtt(content);
			break;
		case 'vtt':
			vttContent = content;
			break;
		default:
			vttContent = content;
	}

	const vttUrl = createSubtitleBlobUrl(vttContent);

	return { type, filename, vttUrl };
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
