/**
 * FitTracker - Capacitor 原生插件注册
 * 
 * 在 Capacitor 原生环境中注册 ShareFile 插件
 * 这样 JS 端就能通过 Capacitor.Plugins.ShareFile 调用原生分享功能
 * 
 * 在纯网页环境中，此文件不会有任何效果（Capacitor 对象不存在）
 */

(function() {
  // 检测是否运行在 Capacitor 原生环境
  if (typeof window.Capacitor !== 'undefined' && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
    try {
      // 注册 ShareFile 插件（保存文件 + 弹出 Android 分享面板）
      window.Capacitor.Plugins.ShareFile = window.Capacitor.registerPlugin('ShareFile');
      console.log('[Capacitor] ShareFile 插件已注册');
    } catch (e) {
      console.warn('[Capacitor] ShareFile 注册失败:', e.message);
    }
  }
})();
