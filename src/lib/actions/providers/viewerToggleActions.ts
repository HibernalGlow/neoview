import {
	executeViewerToggleAction,
	getViewerToggleActionBindings
} from '$lib/utils/viewerToggleActions';
import type { ActionProvider } from '$lib/actions/actionRegistry';

export const actionProvider: ActionProvider = {
	id: 'viewer-toggles',
	getBindings: getViewerToggleActionBindings,
	execute: executeViewerToggleAction
};
