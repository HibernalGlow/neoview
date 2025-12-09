/**
 * Toast utility functions
 * These functions dispatch events to the Toast component
 */

export function showSuccessToast(title: string, description?: string) {
	window.dispatchEvent(new CustomEvent('show-toast', {
		detail: {
			type: 'success',
			title,
			description
		}
	}));
}

export function showErrorToast(title: string, description?: string) {
	window.dispatchEvent(new CustomEvent('show-toast', {
		detail: {
			type: 'error',
			title,
			description
		}
	}));
}

export function showInfoToast(title: string, description?: string) {
	window.dispatchEvent(new CustomEvent('show-toast', {
		detail: {
			type: 'info',
			title,
			description
		}
	}));
}

export function showToast(options: {
	title: string;
	description?: string;
	variant?: 'success' | 'error' | 'info';
	duration?: number;
}) {
	window.dispatchEvent(new CustomEvent('show-toast', {
		detail: {
			type: options.variant || 'info',
			title: options.title,
			description: options.description,
			duration: options.duration
		}
	}));
}