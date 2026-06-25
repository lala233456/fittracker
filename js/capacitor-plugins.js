/**
 * FitTracker - Capacitor 原生插件注册
 * 
 * 在 Capacitor 原生环境中注册 FolderPicker 插件
 * 这样 JS 端就能通过 Capacitor.Plugins.FolderPicker 调用原生方法
 * 
 * 在纯网页环境中，此文件不会有任何效果（Capacitor 对象不存在）
 */

(function() {
  // 检测是否运行在 Capacitor 原生环境
  if (typeof window.Capacitor !== 'undefined' && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
    try {
      // 注册 FolderPicker 插件
      // Java 端已在 MainActivity 中注册了 FolderPickerPlugin.class
      // JS 端注册后创建代理对象，自动桥接到原生方法
      window.Capacitor.Plugins.FolderPicker = window.Capacitor.registerPlugin('FolderPicker');
      console.log('[Capacitor] FolderPicker 插件已注册');
    } catch (e) {
      console.warn('[Capacitor] FolderPicker 注册失败:', e.message);
    }
  }
})();
