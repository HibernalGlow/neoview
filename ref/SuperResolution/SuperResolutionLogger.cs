using System;
using System.Diagnostics;
using System.IO;
using System.Text;

namespace NeeView.SuperResolution
{
    /// <summary>
    /// 超分辨率日志记录器
    /// </summary>
    public class SuperResolutionLogger
    {
        private static readonly string LogDirectory = Path.Combine(
            System.Environment.GetFolderPath(System.Environment.SpecialFolder.LocalApplicationData),
            "NeeView",
            "Logs"
        );

        private static readonly string LogFilePath = Path.Combine(
            LogDirectory,
            $"SuperResolution_{DateTime.Now:yyyyMMdd}.log"
        );

        private static readonly string DevLogFilePath = Path.Combine(
            LogDirectory,
            $"SuperResolution_DEV_{DateTime.Now:yyyyMMdd}.log"
        );

        private static readonly object LogLock = new object();
        
        /// <summary>
        /// 是否为开发模式(Debug 编译)
        /// </summary>
        public static bool IsDevMode
        {
            get
            {
#if DEBUG
                return true;
#else
                return false;
#endif
            }
        }

        static SuperResolutionLogger()
        {
            try
            {
                if (!Directory.Exists(LogDirectory))
                {
                    Directory.CreateDirectory(LogDirectory);
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"创建日志目录失败: {ex.Message}");
            }
        }

        /// <summary>
        /// 日志级别
        /// </summary>
        public enum LogLevel
        {
            Debug,
            Info,
            Warning,
            Error
        }

        /// <summary>
        /// 日志写入事件
        /// </summary>
        public static event EventHandler<LogEventArgs>? LogWritten;

        /// <summary>
        /// 日志事件参数
        /// </summary>
        public class LogEventArgs : EventArgs
        {
            public LogLevel Level { get; }
            public string Message { get; }
            public string FormattedMessage { get; }

            public LogEventArgs(LogLevel level, string message, string formattedMessage)
            {
                Level = level;
                Message = message;
                FormattedMessage = formattedMessage;
            }
        }

        /// <summary>
        /// 写入日志
        /// </summary>
        public static void Log(LogLevel level, string message, Exception? exception = null)
        {
            var timestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff");
            var levelStr = level.ToString().ToUpper().PadRight(7);
            
            var logBuilder = new StringBuilder();
            logBuilder.AppendLine($"[{timestamp}] [{levelStr}] {message}");
            
            if (exception != null)
            {
                logBuilder.AppendLine($"  Exception: {exception.GetType().Name}");
                logBuilder.AppendLine($"  Message: {exception.Message}");
                logBuilder.AppendLine($"  StackTrace:");
                logBuilder.AppendLine(exception.StackTrace);
                
                if (exception.InnerException != null)
                {
                    logBuilder.AppendLine($"  InnerException: {exception.InnerException.Message}");
                }
            }

            var logMessage = logBuilder.ToString();

            // 触发日志写入事件
            LogWritten?.Invoke(null, new LogEventArgs(level, message, logMessage.TrimEnd()));

            // 输出到调试窗口
            Debug.WriteLine(logMessage);

            // 写入文件 - Dev 模式写入单独的日志文件
            try
            {
                lock (LogLock)
                {
                    var targetLogFile = IsDevMode ? DevLogFilePath : LogFilePath;
                    File.AppendAllText(targetLogFile, logMessage, Encoding.UTF8);
                    
                    // Dev 模式额外详细信息
                    if (IsDevMode && level == LogLevel.Debug)
                    {
                        var stackTrace = new StackTrace(true);
                        var frame = stackTrace.GetFrame(2); // 跳过 Log 和调用方法
                        if (frame != null)
                        {
                            var detailMsg = $"  [DEV] 调用位置: {frame.GetFileName()}:{frame.GetFileLineNumber()}\n";
                            File.AppendAllText(targetLogFile, detailMsg, Encoding.UTF8);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"写入日志文件失败: {ex.Message}");
            }
        }

        public static void DebugLog(string message) => Log(LogLevel.Debug, message);
        public static void Info(string message) => Log(LogLevel.Info, message);
        public static void Warning(string message) => Log(LogLevel.Warning, message);
        public static void Error(string message, Exception? exception = null) => Log(LogLevel.Error, message, exception);

        /// <summary>
        /// 获取日志文件路径
        /// </summary>
        public static string GetLogPath() => LogFilePath;

        /// <summary>
        /// 打开日志文件夹
        /// </summary>
        public static void OpenLogFolder()
        {
            try
            {
                if (Directory.Exists(LogDirectory))
                {
                    Process.Start("explorer.exe", LogDirectory);
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"打开日志文件夹失败: {ex.Message}");
            }
        }
    }
}
