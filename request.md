第320行左右有个关键的pyO3 磁盘缓存未命中，hash: 5f9ae98af8905278ab961a5b07cfd724e05c6447
preloadRuntime.ts:53 从 UpscalePanel 持久化读取自动超分开关: false
imageLoader.ts:742 自动超分开关已关闭，不进行现场超分
imageTrace.ts:36 🧭 [ImagePipeline][img-archive-p0-mijthao7-08cf9272] loadCurrentImage callback dispatched (pageIndex=0 hasSecond=false)
ImageViewer.svelte:1123 📄 页面切换 effect 触发: {pageName: '艾西Aiwest - 碧蓝航线 阿蒂利奥·雷戈洛/01.avif', pageIndex: 0, isVideo: false}
也就是说前面都是在浪费性能 毕竟出图要求最快速度 继续修改