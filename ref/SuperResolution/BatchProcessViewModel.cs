using NeeLaboratory.ComponentModel;
using System;
using System.Collections.ObjectModel;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Windows.Input;
using Microsoft.Win32;
using NeeLaboratory.Windows.Input;

namespace NeeView.SuperResolution
{
    /// <summary>
    /// 批量处理项
    /// </summary>
    public class BatchProcessItem : BindableBase
    {
        private string _inputPath = "";
        public string InputPath
        {
            get => _inputPath;
            set => SetProperty(ref _inputPath, value);
        }

        private string _outputPath = "";
        public string OutputPath
        {
            get => _outputPath;
            set => SetProperty(ref _outputPath, value);
        }

        private SuperResolutionStatus _status = SuperResolutionStatus.Pending;
        public SuperResolutionStatus Status
        {
            get => _status;
            set => SetProperty(ref _status, value);
        }

        private int _progress;
        public int Progress
        {
            get => _progress;
            set => SetProperty(ref _progress, value);
        }

        private string _message = "";
        public string Message
        {
            get => _message;
            set => SetProperty(ref _message, value);
        }

        private double _processingTime;
        public double ProcessingTime
        {
            get => _processingTime;
            set => SetProperty(ref _processingTime, value);
        }
    }

    /// <summary>
    /// 批量处理视图模型
    /// </summary>
    public class BatchProcessViewModel : BindableBase
    {
        private readonly SuperResolutionConfig _config;
        private readonly ISuperResolutionService _service;

        public BatchProcessViewModel(SuperResolutionConfig config)
        {
            _config = config ?? throw new ArgumentNullException(nameof(config));
            _service = SuperResolutionService.Current;

            Items = new ObservableCollection<BatchProcessItem>();

            // 初始化命令
            AddFilesCommand = new RelayCommand(AddFiles);
            AddFolderCommand = new RelayCommand(AddFolder);
            RemoveSelectedCommand = new RelayCommand(RemoveSelected, () => SelectedItem != null);
            ClearAllCommand = new RelayCommand(ClearAll, () => Items.Count > 0);
            StartProcessCommand = new RelayCommand(async () => await StartProcessAsync(), CanStartProcess);
            StopProcessCommand = new RelayCommand(StopProcess, () => IsProcessing);
            SelectOutputFolderCommand = new RelayCommand(SelectOutputFolder);
        }

        #region Properties

        /// <summary>
        /// 处理项列表
        /// </summary>
        public ObservableCollection<BatchProcessItem> Items { get; }

        /// <summary>
        /// 选中的项
        /// </summary>
        private BatchProcessItem? _selectedItem;
        public BatchProcessItem? SelectedItem
        {
            get => _selectedItem;
            set => SetProperty(ref _selectedItem, value);
        }

        /// <summary>
        /// 输入文件夹
        /// </summary>
        private string _inputFolder = "";
        public string InputFolder
        {
            get => _inputFolder;
            set => SetProperty(ref _inputFolder, value);
        }

        /// <summary>
        /// 输出文件夹
        /// </summary>
        private string _outputFolder = "";
        public string OutputFolder
        {
            get => _outputFolder;
            set => SetProperty(ref _outputFolder, value);
        }

        /// <summary>
        /// 是否正在处理
        /// </summary>
        private bool _isProcessing;
        public bool IsProcessing
        {
            get => _isProcessing;
            set => SetProperty(ref _isProcessing, value);
        }

        /// <summary>
        /// 总进度
        /// </summary>
        private int _totalProgress;
        public int TotalProgress
        {
            get => _totalProgress;
            set => SetProperty(ref _totalProgress, value);
        }

        /// <summary>
        /// 已处理数量
        /// </summary>
        private int _processedCount;
        public int ProcessedCount
        {
            get => _processedCount;
            set => SetProperty(ref _processedCount, value);
        }

        /// <summary>
        /// 总数量
        /// </summary>
        public int TotalCount => Items.Count;

        #endregion

        #region Commands

        public ICommand AddFilesCommand { get; }
        public ICommand AddFolderCommand { get; }
        public ICommand RemoveSelectedCommand { get; }
        public ICommand ClearAllCommand { get; }
        public ICommand StartProcessCommand { get; }
        public ICommand StopProcessCommand { get; }
        public ICommand SelectOutputFolderCommand { get; }

        #endregion

        #region Methods

        /// <summary>
        /// 添加文件
        /// </summary>
        private void AddFiles()
        {
            var dialog = new OpenFileDialog
            {
                Title = "Select Images",
                Filter = "Image Files|*.jpg;*.jpeg;*.png;*.bmp;*.gif;*.webp;*.tiff|All Files|*.*",
                Multiselect = true
            };

            if (dialog.ShowDialog() == true)
            {
                foreach (var file in dialog.FileNames)
                {
                    AddFile(file);
                }
                RaisePropertyChanged(nameof(TotalCount));
            }
        }

        /// <summary>
        /// 添加文件夹
        /// </summary>
        private void AddFolder()
        {
            var dialog = new System.Windows.Forms.FolderBrowserDialog
            {
                Description = "Select Folder Containing Images"
            };

            if (dialog.ShowDialog() == System.Windows.Forms.DialogResult.OK)
            {
                InputFolder = dialog.SelectedPath;
                var imageExtensions = new[] { ".jpg", ".jpeg", ".png", ".bmp", ".gif", ".webp", ".tiff" };
                var files = Directory.GetFiles(dialog.SelectedPath, "*.*", SearchOption.AllDirectories)
                    .Where(f => imageExtensions.Contains(Path.GetExtension(f).ToLower()));

                foreach (var file in files)
                {
                    AddFile(file);
                }
                RaisePropertyChanged(nameof(TotalCount));
            }
        }

        /// <summary>
        /// 添加单个文件
        /// </summary>
        private void AddFile(string filePath)
        {
            if (Items.Any(i => i.InputPath == filePath))
                return;

            var item = new BatchProcessItem
            {
                InputPath = filePath,
                OutputPath = GenerateOutputPath(filePath),
                Status = SuperResolutionStatus.Pending
            };

            Items.Add(item);
        }

        /// <summary>
        /// 生成输出路径
        /// </summary>
        private string GenerateOutputPath(string inputPath)
        {
            if (!string.IsNullOrEmpty(OutputFolder))
            {
                var fileName = Path.GetFileNameWithoutExtension(inputPath);
                var extension = Path.GetExtension(inputPath);
                return Path.Combine(OutputFolder, $"{fileName}_sr{extension}");
            }

            var dir = Path.GetDirectoryName(inputPath) ?? "";
            var name = Path.GetFileNameWithoutExtension(inputPath);
            var ext = Path.GetExtension(inputPath);
            return Path.Combine(dir, $"{name}_sr{ext}");
        }

        /// <summary>
        /// 移除选中项
        /// </summary>
        private void RemoveSelected()
        {
            if (SelectedItem != null)
            {
                Items.Remove(SelectedItem);
                RaisePropertyChanged(nameof(TotalCount));
            }
        }

        /// <summary>
        /// 清空所有项
        /// </summary>
        private void ClearAll()
        {
            Items.Clear();
            ProcessedCount = 0;
            TotalProgress = 0;
            RaisePropertyChanged(nameof(TotalCount));
        }

        /// <summary>
        /// 选择输出文件夹
        /// </summary>
        private void SelectOutputFolder()
        {
            var dialog = new System.Windows.Forms.FolderBrowserDialog
            {
                Description = "Select Output Folder"
            };

            if (dialog.ShowDialog() == System.Windows.Forms.DialogResult.OK)
            {
                OutputFolder = dialog.SelectedPath;
                
                // 更新所有项的输出路径
                foreach (var item in Items)
                {
                    item.OutputPath = GenerateOutputPath(item.InputPath);
                }
            }
        }

        /// <summary>
        /// 是否可以开始处理
        /// </summary>
        private bool CanStartProcess()
        {
            return Items.Count > 0 && !IsProcessing && _service.IsAvailable;
        }

        /// <summary>
        /// 开始处理
        /// </summary>
        private async Task StartProcessAsync()
        {
            if (!CanStartProcess()) return;

            IsProcessing = true;
            ProcessedCount = 0;
            TotalProgress = 0;

            try
            {
                var pendingItems = Items.Where(i => i.Status == SuperResolutionStatus.Pending ||
                                                   i.Status == SuperResolutionStatus.Failed).ToList();

                foreach (var item in pendingItems)
                {
                    if (!IsProcessing) break;

                    item.Status = SuperResolutionStatus.Processing;
                    item.Progress = 0;
                    item.Message = "Processing...";

                    try
                    {
                        var result = await _service.ProcessFileAsync(
                            item.InputPath,
                            item.OutputPath,
                            _config);

                        if (result.Success)
                        {
                            item.Status = SuperResolutionStatus.Completed;
                            item.Progress = 100;
                            item.ProcessingTime = result.ProcessingTime;
                            item.Message = "Completed";
                        }
                        else
                        {
                            item.Status = SuperResolutionStatus.Failed;
                            item.Message = result.ErrorMessage;
                        }
                    }
                    catch (Exception ex)
                    {
                        item.Status = SuperResolutionStatus.Failed;
                        item.Message = ex.Message;
                    }

                    ProcessedCount++;
                    TotalProgress = (int)((double)ProcessedCount / pendingItems.Count * 100);
                }
            }
            finally
            {
                IsProcessing = false;
            }
        }

        /// <summary>
        /// 停止处理
        /// </summary>
        private void StopProcess()
        {
            IsProcessing = false;
            _service.CancelAllTasks();
        }

        #endregion
    }
}
