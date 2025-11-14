<script lang="ts">
  export type SearchSettings = {
    includeSubfolders: boolean;
    showHistoryOnFocus: boolean;
  };

  export let searchSettings: SearchSettings = {
    includeSubfolders: true,
    showHistoryOnFocus: true,
  };

  export let onChange: (key: keyof SearchSettings, value: boolean) => void = () => {};
</script>

<div class="search-settings absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[200px] p-2">
  <div class="space-y-3">
    <div class="pb-2">
      <h4 class="text-xs font-semibold text-gray-700 mb-2">搜索选项</h4>

      <label class="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={searchSettings.includeSubfolders}
          class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          onchange={(event) => onChange('includeSubfolders', (event.target as HTMLInputElement).checked)}
        />
        <span>搜索子文件夹</span>
      </label>

      <label class="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={searchSettings.showHistoryOnFocus}
          class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          onchange={(event) => onChange('showHistoryOnFocus', (event.target as HTMLInputElement).checked)}
        />
        <span>聚焦时显示历史</span>
      </label>
    </div>
  </div>
</div>
