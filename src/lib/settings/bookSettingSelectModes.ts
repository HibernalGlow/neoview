import type { BookSettingSelectMode } from './settingsManager';

export interface BookSettingSelectModeOption {
  value: BookSettingSelectMode;
  label: string;
  description: string;
}

export const BOOK_SETTING_SELECT_MODE_OPTIONS: BookSettingSelectModeOption[] = [
  {
    value: 'default',
    label: '默认',
    description: '遵循系统默认行为，由全局设置决定。'
  },
  {
    value: 'continue',
    label: '继续',
    description: '沿用上一次的状态，不主动覆盖当前配置。'
  },
  {
    value: 'restoreOrDefault',
    label: '恢复，否则默认',
    description: '优先恢复历史记录，若无法恢复则回退到默认值。'
  },
  {
    value: 'restoreOrContinue',
    label: '恢复，否则继续',
    description: '优先恢复历史记录，若失败则保持继续当前页。'
  }
];

export function getBookSettingSelectModeDescription(value: BookSettingSelectMode): string {
  return BOOK_SETTING_SELECT_MODE_OPTIONS.find((option) => option.value === value)?.description ?? '';
}
