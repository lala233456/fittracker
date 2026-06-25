/**
 * FitTracker - 文件同步存储模块
 * 
 * 三种运行环境适配：
 * 1. Capacitor 原生 Android App → FolderPicker 插件 → 原生文件夹选择器 + 自动读写
 * 2. 桌面 Chrome/Edge → File System Access API → 选择文件夹，自动读写
 * 3. 手机/其他浏览器 → 传统 file input → 选择 JSON 文件加载，手动导出保存
 */

const FILE_SYNC_FILENAME = 'fittracker-data.json';
const FILE_SYNC_KEY = 'fittracker_file_handle';

const FileSync = {
  _dirHandle: null,
  _fileHandle: null,
  _capacitorUri: null,      // Capacitor 原生文件夹 URI
  _capacitorName: null,     // Capacitor 原生文件夹名称
  _initialized: false,
  _isDirSupported: false,
  _isFileSupported: false,
  _isMobile: false,
  _isCapacitor: false,      // 是否运行在 Capacitor 原生环境

  // 检测运行环境
  detect() {
    this._isDirSupported = typeof window.showDirectoryPicker === 'function';
    this._isFileSupported = typeof window.showOpenFilePicker === 'function';
    this._isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    
    // 检测 Capacitor 原生环境
    this._isCapacitor = typeof window.Capacitor !== 'undefined' && 
                         window.Capacitor.isNativePlatform && 
                         window.Capacitor.isNativePlatform();
    
    // Android Chrome 浏览器不支持 showDirectoryPicker，强制降级
    if (this._isMobile && this._isDirSupported) {
      this._isDirSupported = false;
    }
  },

  // 简单判断是否有高级文件 API 或 Capacitor
  hasAdvancedAPI() {
    return this._isCapacitor || this._isDirSupported || this._isFileSupported;
  },

  // ===== 初始化 =====
  async init() {
    this.detect();

    // Capacitor 原生环境：恢复之前保存的文件夹 URI
    if (this._isCapacitor) {
      try {
        const result = await window.Capacitor.Plugins.FolderPicker.hasPersistedUri();
        if (result.hasUri && result.uri) {
          this._capacitorUri = result.uri;
          this._capacitorName = result.name || '未知文件夹';
          this._initialized = true;
          console.log('[FileSync] Capacitor 文件夹恢复:', this._capacitorName);
          return;
        }
      } catch (e) {
        console.log('[FileSync] Capacitor hasPersistedUri 失败:', e.message);
      }
      this._initialized = false;
      return;
    }

    // 桌面端：尝试恢复之前保存的 handle
    if (this.hasAdvancedAPI()) {
      try {
        const savedHandle = await this._loadHandleFromIDB();
        if (savedHandle) {
          if (savedHandle.kind === 'directory') {
            const perm = await savedHandle.queryPermission({ mode: 'readwrite' });
            if (perm === 'granted') {
              this._dirHandle = savedHandle;
              this._initialized = true;
              return;
            }
            const reqPerm = await savedHandle.requestPermission({ mode: 'readwrite' });
            if (reqPerm === 'granted') {
              this._dirHandle = savedHandle;
              this._initialized = true;
              return;
            }
          } else if (savedHandle.kind === 'file') {
            const perm = await savedHandle.queryPermission({ mode: 'readwrite' });
            if (perm === 'granted') {
              this._fileHandle = savedHandle;
              this._initialized = true;
              return;
            }
          }
        }
      } catch (e) {
        console.log('[FileSync] 恢复句柄失败:', e.message);
      }
    }

    this._initialized = false;
  },

  // ===== 欢迎界面 =====
  showWelcomeUI() {
    const main = document.getElementById('appMain');

    let content = `
      <div class="welcome-screen">
        <div class="welcome-icon">💪</div>
        <div class="welcome-title">欢迎使用 FitTracker</div>`;

    if (this._isCapacitor) {
      // Capacitor 原生环境：可以选文件夹！
      content += `
        <div class="welcome-desc">
          选择一个文件夹来保存训练数据<br>
          换手机时选择同一文件夹即可恢复数据
        </div>
        <button class="welcome-btn welcome-btn-primary" onclick="handleCapacitorFolderSelect()">
          📂 选择文件夹
        </button>
        <button class="welcome-btn welcome-btn-secondary" onclick="skipFileSync()">
          仅使用本地存储 →
        </button>
        <div class="welcome-tip">
          💡 推荐选择文件夹，数据自动备份不丢失<br>
          换手机选同一文件夹即可恢复所有记录
        </div>`;
    } else if (!this._isMobile && this._isDirSupported) {
      // 桌面 Chrome/Edge：选择文件夹
      content += `
        <div class="welcome-desc">
          选择一个文件夹来保存训练数据<br>
          换浏览器时选择同一文件夹即可恢复数据
        </div>
        <button class="welcome-btn welcome-btn-primary" onclick="handleFolderSelect()">
          📂 选择文件夹
        </button>
        <button class="welcome-btn welcome-btn-secondary" onclick="skipFileSync()">
          仅使用本地存储 →
        </button>
        <div class="welcome-tip">
          💡 推荐选择文件夹以实现自动备份<br>
          换浏览器选同一文件夹即可恢复数据
        </div>`;
    } else if (this._isFileSupported) {
      content += `
        <div class="welcome-desc">
          选择一个 JSON 文件来保存训练数据<br>
          或加载已有的备份文件恢复数据
        </div>
        <button class="welcome-btn welcome-btn-primary" onclick="handleFileSelect()">
          📄 选择数据文件
        </button>
        <button class="welcome-btn welcome-btn-secondary" onclick="skipFileSync()">
          仅使用本地存储 →
        </button>`;
    } else {
      // 手机浏览器
      content += `
        <div class="welcome-desc">
          训练数据将保存在浏览器本地<br>
          换浏览器时需要手动导出再导入备份
        </div>
        <button class="welcome-btn welcome-btn-primary" onclick="handleMobileImport()">
          📥 从备份文件恢复数据
        </button>
        <button class="welcome-btn welcome-btn-secondary" onclick="skipFileSync()">
          开始使用（本地存储）
        </button>
        <div class="welcome-tip">
          💡 建议每次训练后在设置中导出备份<br>
          将 JSON 文件保存到云盘或发送给自己
        </div>`;
    }

    content += `</div>`;
    main.innerHTML = content;
  },

  // ===== Capacitor 原生：选择文件夹 =====
  async selectCapacitorFolder() {
    try {
      const result = await window.Capacitor.Plugins.FolderPicker.pickFolder();
      this._capacitorUri = result.uri;
      this._capacitorName = result.name;
      this._initialized = true;

      // 检查文件夹中是否有已有数据
      const fileResult = await window.Capacitor.Plugins.FolderPicker.readFile({
        uri: result.uri,
        fileName: FILE_SYNC_FILENAME
      });

      if (fileResult.content && fileResult.content.trim().length > 0) {
        try {
          const data = JSON.parse(fileResult.content);
          await DB.importAll(data);
          showToast('📂 已从文件夹加载已有数据 ✓');
        } catch (e) {
          console.log('[FileSync] 文件内容不是有效 JSON，跳过');
        }
      }

      // 保存当前数据到文件夹
      await this.saveToFile();
      return true;
    } catch (e) {
      if (e.message && e.message.includes('cancelled')) return false;
      console.error('[FileSync] Capacitor 选文件夹失败:', e);
      showToast('选择文件夹失败: ' + (e.message || e));
      return false;
    }
  },

  // ===== 桌面端：选择文件夹 =====
  async selectFolder() {
    try {
      const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      this._dirHandle = dirHandle;
      await this._saveHandleToIDB(dirHandle);

      const existingData = await this._readFromDir(dirHandle);
      if (existingData) {
        await DB.importAll(existingData);
        showToast('📂 已从文件夹加载已有数据 ✓');
      }

      this._initialized = true;
      await this.saveToFile();
      return true;
    } catch (e) {
      if (e.name === 'AbortError') return false;
      console.error('[FileSync] 选择文件夹失败:', e);
      showToast('选择文件夹失败: ' + e.message);
      return false;
    }
  },

  // ===== 桌面端：选择单个文件 =====
  async selectFileAdvanced() {
    try {
      const [fileHandle] = await window.showOpenFilePicker({
        types: [{ description: 'JSON 数据文件', accept: { 'application/json': ['.json'] } }]
      });
      this._fileHandle = fileHandle;
      await this._saveHandleToIDB(fileHandle);

      const file = await fileHandle.getFile();
      const text = await file.text();
      const data = JSON.parse(text);
      await DB.importAll(data);
      showToast('📄 数据文件加载成功 ✓');

      this._initialized = true;
      await this.saveToFile();
      return true;
    } catch (e) {
      if (e.name === 'AbortError') return false;
      showToast('选择文件失败: ' + e.message);
      return false;
    }
  },

  // ===== 手机端：选择 JSON 文件导入 =====
  selectFileMobile() {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.style.display = 'none';
      document.body.appendChild(input);

      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) { resolve(false); document.body.removeChild(input); return; }

        try {
          const text = await file.text();
          const data = JSON.parse(text);
          await DB.importAll(data);
          showToast('📥 数据恢复成功 ✓');
          this._initialized = true;
          resolve(true);
        } catch (err) {
          showToast('文件读取失败: ' + err.message);
          resolve(false);
        }
        document.body.removeChild(input);
      };

      input.oncancel = () => { resolve(false); document.body.removeChild(input); };
      input.click();
    });
  },

  // ===== 自动保存到文件 =====
  async saveToFile() {
    const data = await DB.exportAll();
    const json = JSON.stringify(data, null, 2);

    // Capacitor 原生环境
    if (this._isCapacitor && this._capacitorUri) {
      try {
        await window.Capacitor.Plugins.FolderPicker.writeFile({
          uri: this._capacitorUri,
          fileName: FILE_SYNC_FILENAME,
          content: json
        });
        console.log('[FileSync] Capacitor 数据已保存到文件夹');
        return;
      } catch (e) {
        console.error('[FileSync] Capacitor 保存失败:', e);
        showToast('⚠️ 文件写入失败');
      }
    }

    // 桌面端目录
    if (this._dirHandle) {
      try {
        const fileHandle = await this._dirHandle.getFileHandle(FILE_SYNC_FILENAME, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(json);
        await writable.close();
        console.log('[FileSync] 数据已保存到文件夹');
        return;
      } catch (e) {
        if (e.name === 'NotAllowedError') {
          try {
            const perm = await this._dirHandle.requestPermission({ mode: 'readwrite' });
            if (perm === 'granted') return await this.saveToFile();
          } catch (_) {}
          showToast('⚠️ 文件写入权限被撤销');
        }
        console.error('[FileSync] 保存失败:', e);
      }
    }

    // 桌面端单文件
    if (this._fileHandle) {
      try {
        const writable = await this._fileHandle.createWritable();
        await writable.write(json);
        await writable.close();
        console.log('[FileSync] 数据已保存到文件');
        return;
      } catch (e) {
        console.error('[FileSync] 保存到文件失败:', e);
      }
    }
  },

  // ===== 从文件夹读取 =====
  async _readFromDir(dirHandle) {
    try {
      const fileHandle = await dirHandle.getFileHandle(FILE_SYNC_FILENAME);
      const file = await fileHandle.getFile();
      const text = await file.text();
      return JSON.parse(text);
    } catch (e) {
      return null;
    }
  },

  // ===== IndexedDB handle 存储 =====
  _handleDB: null,
  async _openHandleDB() {
    if (this._handleDB) return this._handleDB;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('FitTrackerFileHandles', 1);
      req.onerror = () => reject(req.error);
      req.onsuccess = (e) => { this._handleDB = e.target.result; resolve(this._handleDB); };
      req.onupgradeneeded = (e) => { e.target.result.createObjectStore('handles'); };
    });
  },
  async _saveHandleToIDB(handle) {
    const db = await this._openHandleDB();
    const tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').put(handle, FILE_SYNC_KEY);
    return new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
  },
  async _loadHandleFromIDB() {
    const db = await this._openHandleDB();
    const tx = db.transaction('handles', 'readonly');
    const req = tx.objectStore('handles').get(FILE_SYNC_KEY);
    return new Promise((res, rej) => { req.onsuccess = () => res(req.result || null); req.onerror = () => rej(req.error); });
  },
  async clearHandle() {
    this._dirHandle = null;
    this._fileHandle = null;
    this._capacitorUri = null;
    this._capacitorName = null;
    this._initialized = false;

    if (this._isCapacitor) {
      // Capacitor 环境下清空 SharedPreferences
      try {
        // 插件没有 clearPersistedUri 方法，但 SharedPreferences 会在下次 pickFolder 时更新
      } catch (e) {}
    }

    const db = await this._openHandleDB();
    const tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').delete(FILE_SYNC_KEY);
    return new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
  },

  // ===== 设置页操作 =====
  async reSelectFolder() {
    if (this._isCapacitor) {
      const result = await this.selectCapacitorFolder();
      if (result) { await renderSettings(); showToast('📂 文件夹已更新 ✓'); }
    } else if (this._isDirSupported) {
      const result = await this.selectFolder();
      if (result) { await renderSettings(); showToast('📂 文件夹已更新 ✓'); }
    } else if (this._isFileSupported) {
      const result = await this.selectFileAdvanced();
      if (result) { await renderSettings(); showToast('📄 数据文件已更新 ✓'); }
    } else {
      showToast('手机浏览器请在设置中手动导出/导入备份');
    }
  },

  async unlinkFolder() {
    await this.clearHandle();
    await renderSettings();
    showToast('已解除文件绑定');
  },

  // ===== 判断是否显示欢迎界面 =====
  async shouldShowWelcome() {
    const plans = await DB.plans.getAll();
    const records = await DB.records.getAll();
    if (plans.length > 0 || records.length > 0) return false;
    if (this._initialized) return false;
    return true;
  },

  // ===== 获取存储状态描述 =====
  getStorageDesc() {
    if (this._isCapacitor && this._capacitorUri) {
      return { type: 'folder', name: this._capacitorName, auto: true, native: true };
    }
    if (this._dirHandle) return { type: 'folder', name: this._dirHandle.name, auto: true };
    if (this._fileHandle) return { type: 'file', name: this._fileHandle.name, auto: true };
    return { type: 'local', name: null, auto: false };
  }
};

// ===== 全局回调 =====
async function handleCapacitorFolderSelect() {
  const result = await FileSync.selectCapacitorFolder();
  if (result) await renderPage('today');
}

async function handleFolderSelect() {
  const result = await FileSync.selectFolder();
  if (result) await renderPage('today');
}

async function handleFileSelect() {
  const result = await FileSync.selectFileAdvanced();
  if (result) await renderPage('today');
}

async function handleMobileImport() {
  const result = await FileSync.selectFileMobile();
  if (result) await renderPage('today');
}

async function skipFileSync() {
  FileSync._initialized = true;
  await renderPage('today');
}
