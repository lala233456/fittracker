/**
 * FitTracker - 数据库层 (IndexedDB)
 * 管理：训练计划、训练记录、打卡记录
 */

const DB_NAME = 'FitTrackerDB';
const DB_VERSION = 1;
let db = null;

const DB = {
  // 初始化数据库
  async init() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => reject(req.error);
      req.onsuccess = (e) => {
        db = e.target.result;
        resolve(db);
      };
      req.onupgradeneeded = (e) => {
        const database = e.target.result;
        // 训练计划表（按天隔离，每天创建新计划）
        if (!database.objectStoreNames.contains('plans')) {
          const planStore = database.createObjectStore('plans', { keyPath: 'id', autoIncrement: true });
          planStore.createIndex('name', 'name', { unique: false });
          planStore.createIndex('date', 'date', { unique: false });
        }
        // 每日训练记录表
        if (!database.objectStoreNames.contains('records')) {
          const recordStore = database.createObjectStore('records', { keyPath: 'id', autoIncrement: true });
          recordStore.createIndex('date', 'date', { unique: false });
          recordStore.createIndex('planId', 'planId', { unique: false });
        }
        // 打卡记录表（每日汇总）
        if (!database.objectStoreNames.contains('checkins')) {
          const checkinStore = database.createObjectStore('checkins', { keyPath: 'date' });
        }
      };
    });
  },

  // ===== 训练计划操作（按天隔离） =====
  plans: {
    async getAll() {
      return new Promise((resolve, reject) => {
        const tx = db.transaction('plans', 'readonly');
        const store = tx.objectStore('plans');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    },
    // 获取某天的训练计划
    async getByDate(date) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction('plans', 'readonly');
        const store = tx.objectStore('plans');
        const idx = store.index('date');
        const req = idx.getAll(date);
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    },
    async get(id) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction('plans', 'readonly');
        const store = tx.objectStore('plans');
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    },
    async add(plan) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction('plans', 'readwrite');
        const store = tx.objectStore('plans');
        const data = { ...plan, createdAt: Date.now(), updatedAt: Date.now() };
        const req = store.add(data);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    },
    async update(plan) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction('plans', 'readwrite');
        const store = tx.objectStore('plans');
        const data = { ...plan, updatedAt: Date.now() };
        const req = store.put(data);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    },
    async delete(id) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction('plans', 'readwrite');
        const store = tx.objectStore('plans');
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }
  },

  // ===== 训练记录操作 =====
  records: {
    async getAll() {
      return new Promise((resolve, reject) => {
        const tx = db.transaction('records', 'readonly');
        const store = tx.objectStore('records');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    },
    async getByDate(date) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction('records', 'readonly');
        const store = tx.objectStore('records');
        const idx = store.index('date');
        const req = idx.getAll(date);
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    },
    async getByDateRange(startDate, endDate) {
      const all = await this.getAll();
      return all.filter(r => r.date >= startDate && r.date <= endDate);
    },
    async add(record) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction('records', 'readwrite');
        const store = tx.objectStore('records');
        const data = { ...record, createdAt: Date.now() };
        const req = store.add(data);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    },
    async update(record) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction('records', 'readwrite');
        const store = tx.objectStore('records');
        const req = store.put(record);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    },
    async delete(id) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction('records', 'readwrite');
        const store = tx.objectStore('records');
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }
  },

  // ===== 打卡记录操作 =====
  checkins: {
    async getAll() {
      return new Promise((resolve, reject) => {
        const tx = db.transaction('checkins', 'readonly');
        const store = tx.objectStore('checkins');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    },
    async get(date) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction('checkins', 'readonly');
        const store = tx.objectStore('checkins');
        const req = store.get(date);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    },
    async put(checkin) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction('checkins', 'readwrite');
        const store = tx.objectStore('checkins');
        const req = store.put(checkin);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
  },

  // ===== 数据导出 =====
  async exportAll() {
    const [plans, records, checkins] = await Promise.all([
      this.plans.getAll(),
      this.records.getAll(),
      this.checkins.getAll()
    ]);
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      plans,
      records,
      checkins
    };
  },

  // ===== 数据导入 =====
  async importAll(data) {
    if (!data || data.version !== 1) throw new Error('数据格式不兼容');
    
    // 导入计划
    for (const plan of (data.plans || [])) {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('plans', 'readwrite');
        const store = tx.objectStore('plans');
        const req = store.put(plan);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }
    // 导入记录
    for (const record of (data.records || [])) {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('records', 'readwrite');
        const store = tx.objectStore('records');
        const req = store.put(record);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }
    // 导入打卡
    for (const checkin of (data.checkins || [])) {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('checkins', 'readwrite');
        const store = tx.objectStore('checkins');
        const req = store.put(checkin);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }
  },

  // ===== 清空所有数据 =====
  async clearAll() {
    const stores = ['plans', 'records', 'checkins'];
    for (const s of stores) {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(s, 'readwrite');
        const store = tx.objectStore(s);
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }
  }
};
