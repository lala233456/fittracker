/**
 * FitTracker - 主应用逻辑
 */

// ===== 工具函数 =====
const Utils = {
  today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },
  formatDate(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${y}年${parseInt(m)}月${parseInt(d)}日`;
  },
  formatTime(ts) {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  },
  getMonthDays(year, month) {
    return new Date(year, month + 1, 0).getDate();
  },
  getFirstDayOfMonth(year, month) {
    return new Date(year, month, 1).getDay();
  },
  dateAdd(dateStr, days) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },
  weekdays: ['日','一','二','三','四','五','六'],
  greetings() {
    const h = new Date().getHours();
    if (h < 6) return '深夜了，注意休息 🌙';
    if (h < 10) return '早上好，加油训练！☀️';
    if (h < 12) return '上午好，准备开练！💪';
    if (h < 14) return '中午了，训练加油！🔥';
    if (h < 18) return '下午好，保持动力！⚡';
    if (h < 21) return '晚上好，今日训练！🌟';
    return '晚了，完成今日计划吧 🌙';
  }
};

// ===== 全局状态 =====
const State = {
  currentPage: 'today',
  theme: localStorage.getItem('theme') || 'light',
  historyMonth: { year: new Date().getFullYear(), month: new Date().getMonth() },
  statsTab: 'week',
  statsChart: null,
  // 今日进行中的训练会话
  activeSessions: {}, // planId -> { exercises: { exId: { doneSets } }, startTime }
};

// ===== Toast =====
function showToast(msg, duration = 2000) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  t.classList.add('show');
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.classList.add('hidden'), 300);
  }, duration);
}

// ===== 模态框 =====
const Modal = {
  show(html, onClose) {
    const overlay = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');
    content.innerHTML = html;
    overlay.classList.remove('hidden');
    overlay.onclick = (e) => { if (e.target === overlay) { Modal.close(); onClose && onClose(); } };
    setTimeout(() => overlay.classList.add('show'), 10);
  },
  close() {
    const overlay = document.getElementById('modalOverlay');
    overlay.classList.remove('show');
    setTimeout(() => overlay.classList.add('hidden'), 200);
  }
};

// ===== 主题切换 =====
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  State.theme = t;
  localStorage.setItem('theme', t);
}
document.getElementById('themeToggle').onclick = () => {
  applyTheme(State.theme === 'dark' ? 'light' : 'dark');
};
applyTheme(State.theme);

// ===== 底部导航 =====
document.getElementById('bottomNav').addEventListener('click', e => {
  const item = e.target.closest('.nav-item');
  if (!item) return;
  const page = item.dataset.page;
  if (page === State.currentPage) return;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  item.classList.add('active');
  State.currentPage = page;
  renderPage(page);
});

// ===== 页面路由 =====
async function renderPage(page) {
  const main = document.getElementById('appMain');
  main.innerHTML = '';
  switch (page) {
    case 'today': await renderToday(); break;
    case 'plans': await renderPlans(); break;
    case 'history': await renderHistory(); break;
    case 'stats': await renderStats(); break;
    case 'settings': await renderSettings(); break;
  }
}

// ===== 今日页面 =====
async function renderToday() {
  const main = document.getElementById('appMain');
  const today = Utils.today();
  const plans = await DB.plans.getAll();
  const todayRecords = await DB.records.getByDate(today);
  const todayCheckin = await DB.checkins.get(today);
  const allCheckins = await DB.checkins.getAll();

  // 计算连续打卡天数
  let streak = 0;
  let checkDate = today;
  while (true) {
    const ci = allCheckins.find(c => c.date === checkDate);
    if (ci && ci.completed) { streak++; checkDate = Utils.dateAdd(checkDate, -1); }
    else break;
  }

  // 今日总次数
  const totalSets = todayRecords.reduce((s, r) => s + (r.completedSets || 0), 0);
  const totalExs = todayRecords.reduce((s, r) => s + (r.completedExercises ? r.completedExercises.length : 0), 0);
  const completedPlans = todayRecords.filter(r => r.completed).length;

  let html = `<div class="page-enter">`;

  // 问候
  html += `
    <div class="today-greeting">
      <div class="greeting-text">${Utils.greetings()}</div>
      <div class="greeting-date">${Utils.formatDate(today)} · ${['周日','周一','周二','周三','周四','周五','周六'][new Date().getDay()]}</div>
    </div>`;

  // 连击条
  if (streak > 0) {
    html += `
      <div class="streak-banner">
        <div class="streak-fire">🔥</div>
        <div class="streak-info">
          <div class="streak-count">${streak} 天连续训练</div>
          <div class="streak-label">保持下去，你很厉害！</div>
        </div>
      </div>`;
  }

  // 今日统计
  html += `
    <div class="today-stats">
      <div class="stat-card">
        <div class="stat-value">${completedPlans}</div>
        <div class="stat-label">完成计划</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${totalExs}</div>
        <div class="stat-label">完成动作</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${totalSets}</div>
        <div class="stat-label">完成组数</div>
      </div>
    </div>`;

  // 今日计划列表
  if (plans.length === 0) {
    html += `
      <div class="section-header"><span class="section-title">今日训练</span></div>
      <div class="no-plan-today card">
        <div class="empty-icon">🏋️</div>
        <div class="empty-title">还没有训练计划</div>
        <div class="empty-desc">去「计划」页面创建你的第一个训练计划吧</div>
        <button class="btn btn-primary btn-sm" onclick="switchPage('plans')">创建计划</button>
      </div>`;
  } else {
    html += `<div class="section-header"><span class="section-title">今日训练</span></div>`;
    for (const plan of plans) {
      // 查找今日该计划的记录
      const record = todayRecords.find(r => r.planId === plan.id) || null;
      html += renderTodayPlanCard(plan, record, today);
    }
  }

  html += `</div>`;
  main.innerHTML = html;
}

function renderTodayPlanCard(plan, record, today) {
  const exercises = plan.exercises || [];
  const session = State.activeSessions[plan.id];
  const isCompleted = record && record.completed;

  let doneSetsMap = {};
  let completedExIds = new Set();

  if (session) {
    doneSetsMap = session.exercises || {};
    completedExIds = new Set(Object.keys(doneSetsMap).filter(id => doneSetsMap[id] >= (exercises.find(e=>String(e.id)===id)||{sets:1}).sets));
  } else if (record) {
    (record.completedExercises || []).forEach(exId => completedExIds.add(String(exId)));
    doneSetsMap = record.setsMap || {};
  }

  const totalEx = exercises.length;
  const doneEx = completedExIds.size;
  const progress = totalEx > 0 ? Math.round((doneEx / totalEx) * 100) : 0;

  let statusBadge = '';
  if (isCompleted) statusBadge = `<span class="plan-badge done">已完成 ✓</span>`;
  else if (session) statusBadge = `<span class="plan-badge active">训练中</span>`;
  else statusBadge = `<span class="plan-badge">未开始</span>`;

  let exHtml = exercises.map(ex => {
    const exIdStr = String(ex.id);
    const isDone = completedExIds.has(exIdStr);
    const doneSets = doneSetsMap[exIdStr] || 0;
    return `
      <div class="exercise-item ${isDone ? 'completed' : ''}" id="ex-item-${plan.id}-${ex.id}">
        <div class="exercise-check ${isDone ? 'checked' : ''}" 
             onclick="toggleExercise(${plan.id}, ${ex.id})"
             id="ex-check-${plan.id}-${ex.id}"></div>
        <div class="exercise-info">
          <div class="exercise-name">${ex.name}</div>
          <div class="exercise-detail">${ex.sets}组 × ${ex.reps}次${ex.weight ? ' · ' + ex.weight + 'kg' : ''}${ex.note ? ' · ' + ex.note : ''}</div>
        </div>
        ${!isCompleted ? `
        <div class="set-counter">
          <button class="set-btn" onclick="adjustSets(${plan.id},${ex.id},-1)">−</button>
          <span class="set-count" id="set-cnt-${plan.id}-${ex.id}">${doneSets}/${ex.sets}</span>
          <button class="set-btn" onclick="adjustSets(${plan.id},${ex.id},1)">+</button>
        </div>` : ''}
      </div>`;
  }).join('');

  const allDone = doneEx === totalEx && totalEx > 0;
  const checkinBtnLabel = isCompleted ? '已打卡 ✓' : allDone ? '完成训练 打卡！' : `训练进行中 (${doneEx}/${totalEx})`;

  return `
    <div class="plan-card" id="plan-card-${plan.id}">
      <div class="plan-header">
        <div class="plan-name">${plan.name}</div>
        ${statusBadge}
      </div>
      <div class="progress-wrap">
        <div class="progress-bar" id="prog-${plan.id}" style="width:${progress}%"></div>
      </div>
      <div class="exercise-list">${exHtml}</div>
      <div class="checkin-btn-wrap">
        <button class="checkin-btn ${isCompleted ? 'done-btn' : ''}" 
                id="checkin-btn-${plan.id}"
                onclick="checkIn(${plan.id}, '${today}')"
                ${isCompleted ? 'disabled' : ''}>
          ${checkinBtnLabel}
        </button>
      </div>
    </div>`;
}

// 调整已完成组数
function adjustSets(planId, exId, delta) {
  if (!State.activeSessions[planId]) {
    State.activeSessions[planId] = { exercises: {}, startTime: Date.now() };
  }
  const session = State.activeSessions[planId];
  const plan = State._plans ? State._plans.find(p => p.id === planId) : null;
  const exIdStr = String(exId);
  const current = session.exercises[exIdStr] || 0;
  const newVal = Math.max(0, current + delta);
  session.exercises[exIdStr] = newVal;

  // 更新UI
  const cnt = document.getElementById(`set-cnt-${planId}-${exId}`);
  if (cnt) {
    // 从DOM获取最大组数
    const detail = cnt.closest('.exercise-item').querySelector('.exercise-detail');
    const maxSets = parseInt(detail.textContent) || 3;
    cnt.textContent = `${newVal}/${maxSets}`;
  }

  // 检查是否达到组数目标
  DB.plans.get(planId).then(plan => {
    if (!plan) return;
    const ex = plan.exercises.find(e => e.id === exId);
    if (!ex) return;
    const done = newVal >= ex.sets;
    
    const checkEl = document.getElementById(`ex-check-${planId}-${exId}`);
    const itemEl = document.getElementById(`ex-item-${planId}-${exId}`);
    
    if (done) {
      if (checkEl) { checkEl.classList.add('checked'); checkEl.classList.add('pop-anim'); }
      if (itemEl) itemEl.classList.add('completed');
      if (!session.exercises[exIdStr + '_done']) {
        session.exercises[exIdStr + '_done'] = true;
      }
    } else {
      if (checkEl) checkEl.classList.remove('checked');
      if (itemEl) itemEl.classList.remove('completed');
      session.exercises[exIdStr + '_done'] = false;
    }

    // 更新进度
    updatePlanProgress(planId, plan);
  });
}

// 切换动作完成状态
function toggleExercise(planId, exId) {
  if (!State.activeSessions[planId]) {
    State.activeSessions[planId] = { exercises: {}, startTime: Date.now() };
  }
  const session = State.activeSessions[planId];
  const exIdStr = String(exId);

  DB.plans.get(planId).then(plan => {
    if (!plan) return;
    const ex = plan.exercises.find(e => e.id === exId);
    if (!ex) return;

    const currentSets = session.exercises[exIdStr] || 0;
    const isDone = currentSets >= ex.sets;

    if (isDone) {
      // 取消完成
      session.exercises[exIdStr] = 0;
    } else {
      // 标记完成（设为满组数）
      session.exercises[exIdStr] = ex.sets;
    }

    const checkEl = document.getElementById(`ex-check-${planId}-${exId}`);
    const itemEl = document.getElementById(`ex-item-${planId}-${exId}`);
    const cnt = document.getElementById(`set-cnt-${planId}-${exId}`);

    const newDone = !isDone;
    if (checkEl) {
      checkEl.classList.toggle('checked', newDone);
      if (newDone) {
        checkEl.style.animation = 'none';
        checkEl.offsetHeight;
        checkEl.style.animation = '';
        checkEl.classList.add('pop-anim');
        setTimeout(() => checkEl.classList.remove('pop-anim'), 300);
      }
    }
    if (itemEl) itemEl.classList.toggle('completed', newDone);
    if (cnt) cnt.textContent = `${session.exercises[exIdStr]}/${ex.sets}`;

    updatePlanProgress(planId, plan);
    if (newDone) showToast(`✓ ${ex.name} 完成！`);
  });
}

// 更新进度条和打卡按钮
function updatePlanProgress(planId, plan) {
  const session = State.activeSessions[planId];
  if (!session) return;
  const exercises = plan.exercises || [];
  const doneCount = exercises.filter(ex => {
    return (session.exercises[String(ex.id)] || 0) >= ex.sets;
  }).length;
  const total = exercises.length;
  const progress = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  const progBar = document.getElementById(`prog-${planId}`);
  if (progBar) progBar.style.width = progress + '%';

  const btn = document.getElementById(`checkin-btn-${planId}`);
  if (btn) {
    btn.textContent = doneCount === total && total > 0
      ? '完成训练 打卡！'
      : `训练进行中 (${doneCount}/${total})`;
  }
}

// 打卡
async function checkIn(planId, date) {
  const plan = await DB.plans.get(planId);
  if (!plan) return;

  const session = State.activeSessions[planId] || { exercises: {}, startTime: Date.now() };
  const exercises = plan.exercises || [];

  const completedExercises = exercises
    .filter(ex => (session.exercises[String(ex.id)] || 0) >= ex.sets)
    .map(ex => ex.id);

  const setsMap = {};
  exercises.forEach(ex => {
    setsMap[String(ex.id)] = session.exercises[String(ex.id)] || 0;
  });

  const allCompleted = completedExercises.length === exercises.length && exercises.length > 0;
  const totalSets = Object.values(setsMap).reduce((a, b) => a + b, 0);

  // 保存训练记录
  const existingRecords = await DB.records.getByDate(date);
  const existingRecord = existingRecords.find(r => r.planId === planId);

  const recordData = {
    planId,
    planName: plan.name,
    date,
    completedExercises,
    setsMap,
    completedSets: totalSets,
    completed: allCompleted,
    duration: Math.round((Date.now() - (session.startTime || Date.now())) / 60000),
    timestamp: Date.now()
  };

  if (existingRecord) {
    await DB.records.update({ ...existingRecord, ...recordData });
  } else {
    await DB.records.add(recordData);
  }

  // 更新每日打卡汇总
  const allRecords = await DB.records.getByDate(date);
  const allPlans = await DB.plans.getAll();
  const allPlansDone = allPlans.every(p => {
    const r = allRecords.find(rec => rec.planId === p.id);
    return r && r.completed;
  });

  await DB.checkins.put({
    date,
    completed: allPlansDone,
    planCount: allPlans.length,
    completedPlanCount: allRecords.filter(r => r.completed).length,
    totalSets: allRecords.reduce((s, r) => s + (r.completedSets || 0), 0),
    timestamp: Date.now()
  });

  delete State.activeSessions[planId];

  showToast(allCompleted ? '🎉 训练完成！已打卡' : '📝 记录已保存');
  await renderToday();
}

function switchPage(page) {
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.page === page);
  });
  State.currentPage = page;
  renderPage(page);
}

// ===== 计划页面 =====
async function renderPlans() {
  const main = document.getElementById('appMain');
  const plans = await DB.plans.getAll();
  State._plans = plans;

  let html = `<div class="page-enter">`;
  html += `
    <div class="section-header">
      <span class="section-title">训练计划 (${plans.length})</span>
      <button class="btn btn-primary btn-sm" onclick="showAddPlanModal()">+ 新建计划</button>
    </div>`;

  if (plans.length === 0) {
    html += `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <div class="empty-title">还没有训练计划</div>
        <div class="empty-desc">创建你的第一个训练计划，包含动作、组数、次数等详细设置</div>
        <button class="btn btn-primary" onclick="showAddPlanModal()">+ 创建计划</button>
      </div>`;
  } else {
    html += `<div class="plan-list">`;
    for (const plan of plans) {
      const exChips = (plan.exercises || []).map(ex =>
        `<span class="exercise-chip">${ex.name}</span>`
      ).join('');
      html += `
        <div class="plan-item">
          <div class="plan-item-header">
            <div class="plan-item-info">
              <div class="plan-item-name">${plan.name}</div>
              <div class="plan-item-meta">${(plan.exercises || []).length} 个动作 · ${plan.description || '暂无描述'}</div>
            </div>
            <div class="plan-item-actions">
              <button class="btn btn-ghost btn-sm" onclick="showEditPlanModal(${plan.id})">编辑</button>
              <button class="btn btn-danger btn-sm" onclick="deletePlan(${plan.id})">删除</button>
            </div>
          </div>
          <div class="exercise-chips">${exChips}</div>
        </div>`;
    }
    html += `</div>`;
  }
  html += `</div>`;
  main.innerHTML = html;
}

// 新建计划模态框
function showAddPlanModal() {
  showPlanModal(null);
}
async function showEditPlanModal(planId) {
  const plan = await DB.plans.get(planId);
  showPlanModal(plan);
}

let _modalExercises = [];

function showPlanModal(plan) {
  _modalExercises = plan ? JSON.parse(JSON.stringify(plan.exercises || [])) : [];
  const isEdit = !!plan;

  const exListHtml = () => _modalExercises.map((ex, i) => `
    <div class="edit-exercise-item" id="edit-ex-${i}">
      <div class="edit-exercise-name">${ex.name}</div>
      <div class="edit-exercise-detail">${ex.sets}组×${ex.reps}次${ex.weight?'·'+ex.weight+'kg':''}</div>
      <button class="btn btn-icon btn-ghost" onclick="removeEditExercise(${i})" style="font-size:16px;color:var(--danger)">×</button>
    </div>`).join('');

  const html = `
    <div class="modal-drag-handle"></div>
    <div class="modal-title">${isEdit ? '编辑训练计划' : '新建训练计划'}</div>
    <div class="form-group">
      <label class="form-label">计划名称 *</label>
      <input class="form-input" id="planName" placeholder="例如：胸部训练、腿部训练" value="${plan ? plan.name : ''}">
    </div>
    <div class="form-group">
      <label class="form-label">备注描述</label>
      <input class="form-input" id="planDesc" placeholder="可选：计划说明" value="${plan ? (plan.description||'') : ''}">
    </div>
    <div class="section-header" style="margin-bottom:8px">
      <span class="section-title" style="font-size:14px">训练动作</span>
    </div>
    <div id="editExList">${exListHtml()}</div>
    <div style="background:var(--bg-secondary);border-radius:var(--radius-sm);padding:12px;margin-bottom:16px">
      <div style="font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:8px">添加动作</div>
      <div class="form-group" style="margin-bottom:8px">
        <input class="form-input" id="newExName" placeholder="动作名称，如：俯卧撑">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px">
        <div>
          <label class="form-label">组数</label>
          <input class="form-input" id="newExSets" type="number" min="1" value="3" placeholder="组">
        </div>
        <div>
          <label class="form-label">次数</label>
          <input class="form-input" id="newExReps" type="number" min="1" value="10" placeholder="次">
        </div>
        <div>
          <label class="form-label">重量(kg)</label>
          <input class="form-input" id="newExWeight" type="number" min="0" placeholder="可选">
        </div>
      </div>
      <div class="form-group" style="margin-bottom:8px">
        <input class="form-input" id="newExNote" placeholder="备注（可选）">
      </div>
      <button class="btn btn-outline btn-block btn-sm" onclick="addEditExercise()">+ 添加该动作</button>
    </div>
    <div style="display:flex;gap:10px">
      <button class="btn btn-ghost btn-block" onclick="Modal.close()">取消</button>
      <button class="btn btn-primary btn-block" onclick="savePlan(${plan ? plan.id : 'null'})">
        ${isEdit ? '保存更改' : '创建计划'}
      </button>
    </div>`;

  Modal.show(html);
}

function addEditExercise() {
  const name = document.getElementById('newExName').value.trim();
  const sets = parseInt(document.getElementById('newExSets').value) || 3;
  const reps = parseInt(document.getElementById('newExReps').value) || 10;
  const weight = parseFloat(document.getElementById('newExWeight').value) || 0;
  const note = document.getElementById('newExNote').value.trim();

  if (!name) { showToast('请输入动作名称'); return; }
  _modalExercises.push({ id: Date.now(), name, sets, reps, weight: weight || 0, note });
  
  // 清空输入
  document.getElementById('newExName').value = '';
  document.getElementById('newExSets').value = '3';
  document.getElementById('newExReps').value = '10';
  document.getElementById('newExWeight').value = '';
  document.getElementById('newExNote').value = '';

  // 更新列表
  document.getElementById('editExList').innerHTML = _modalExercises.map((ex, i) => `
    <div class="edit-exercise-item" id="edit-ex-${i}">
      <div class="edit-exercise-name">${ex.name}</div>
      <div class="edit-exercise-detail">${ex.sets}组×${ex.reps}次${ex.weight?'·'+ex.weight+'kg':''}</div>
      <button class="btn btn-icon btn-ghost" onclick="removeEditExercise(${i})" style="font-size:16px;color:var(--danger)">×</button>
    </div>`).join('');
  showToast(`已添加：${name}`);
}

function removeEditExercise(idx) {
  _modalExercises.splice(idx, 1);
  document.getElementById('editExList').innerHTML = _modalExercises.map((ex, i) => `
    <div class="edit-exercise-item" id="edit-ex-${i}">
      <div class="edit-exercise-name">${ex.name}</div>
      <div class="edit-exercise-detail">${ex.sets}组×${ex.reps}次${ex.weight?'·'+ex.weight+'kg':''}</div>
      <button class="btn btn-icon btn-ghost" onclick="removeEditExercise(${i})" style="font-size:16px;color:var(--danger)">×</button>
    </div>`).join('');
}

async function savePlan(planId) {
  const name = document.getElementById('planName').value.trim();
  const description = document.getElementById('planDesc').value.trim();
  if (!name) { showToast('请输入计划名称'); return; }
  if (_modalExercises.length === 0) { showToast('请至少添加一个训练动作'); return; }

  const planData = { name, description, exercises: _modalExercises };
  if (planId) {
    await DB.plans.update({ ...planData, id: planId });
    showToast('计划已更新 ✓');
  } else {
    await DB.plans.add(planData);
    showToast('计划已创建 ✓');
  }
  Modal.close();
  await renderPlans();
}

async function deletePlan(planId) {
  const plan = await DB.plans.get(planId);
  Modal.show(`
    <div class="modal-drag-handle"></div>
    <div class="modal-title">删除计划</div>
    <div class="confirm-dialog">
      <div class="confirm-message">确定要删除「<strong>${plan.name}</strong>」吗？<br>相关训练记录不会被删除。</div>
      <div class="confirm-actions">
        <button class="btn btn-ghost" onclick="Modal.close()">取消</button>
        <button class="btn btn-danger" onclick="confirmDeletePlan(${planId})">删除</button>
      </div>
    </div>`);
}

async function confirmDeletePlan(planId) {
  await DB.plans.delete(planId);
  Modal.close();
  showToast('已删除');
  await renderPlans();
}

// ===== 历史页面 =====
async function renderHistory() {
  const main = document.getElementById('appMain');
  const { year, month } = State.historyMonth;
  const today = Utils.today();
  const allCheckins = await DB.checkins.getAll();

  const daysInMonth = Utils.getMonthDays(year, month);
  const firstDay = Utils.getFirstDayOfMonth(year, month);

  // 打卡日期集合
  const checkinDates = new Map(allCheckins.map(c => [c.date, c]));

  let calHtml = '';
  Utils.weekdays.forEach(d => { calHtml += `<div class="calendar-weekday">${d}</div>`; });
  for (let i = 0; i < firstDay; i++) calHtml += `<div class="calendar-day empty"></div>`;

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const checkin = checkinDates.get(dateStr);
    const isToday = dateStr === today;
    const hasData = !!checkin;
    const isCompleted = checkin && checkin.completed;
    const isSelected = dateStr === (State.selectedHistoryDate || today);
    let cls = 'calendar-day';
    if (isCompleted) cls += ' completed-day';
    else if (hasData) cls += ' has-data';
    if (isToday) cls += ' today';
    if (isSelected) cls += ' selected';
    calHtml += `<div class="${cls}" onclick="selectHistoryDate('${dateStr}')">${d}</div>`;
  }

  const selectedDate = State.selectedHistoryDate || today;

  let html = `<div class="page-enter">
    <div class="card" style="margin-bottom:16px">
      <div class="calendar-nav">
        <button class="btn btn-ghost btn-sm" onclick="changeHistoryMonth(-1)">‹ 上月</button>
        <span class="calendar-month">${year}年${month+1}月</span>
        <button class="btn btn-ghost btn-sm" onclick="changeHistoryMonth(1)">下月 ›</button>
      </div>
      <div class="calendar-grid">${calHtml}</div>
      <div style="display:flex;gap:12px;font-size:12px;color:var(--text-muted)">
        <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--success);opacity:0.6;margin-right:4px"></span>全部完成</span>
        <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--primary);margin-right:4px"></span>部分完成</span>
      </div>
    </div>
    <div class="section-header">
      <span class="section-title">${Utils.formatDate(selectedDate)} 记录</span>
    </div>
    <div id="historyDetail" class="history-detail"></div>
  </div>`;

  main.innerHTML = html;
  await loadHistoryDetail(selectedDate);
}

async function loadHistoryDetail(date) {
  const container = document.getElementById('historyDetail');
  if (!container) return;
  const records = await DB.records.getByDate(date);

  if (records.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <div class="empty-title">当日无训练记录</div>
        <div class="empty-desc">选择其他日期查看，或开始今日训练</div>
      </div>`;
    return;
  }

  container.innerHTML = records.map(r => {
    const badge = r.completed
      ? `<span class="history-badge badge-done">完成</span>`
      : `<span class="history-badge badge-partial">部分</span>`;
    const exHtml = (Object.entries(r.setsMap || {})).map(([exId, doneSets]) => {
      const isDone = (r.completedExercises || []).includes(parseInt(exId));
      return `<div class="history-exercise ${isDone ? 'done' : ''}">
        <div class="history-exercise-dot"></div>
        <span>已完成 ${doneSets} 组</span>
      </div>`;
    }).join('') || '<div style="font-size:13px;color:var(--text-muted)">无详情</div>';

    return `
      <div class="history-record">
        <div class="history-record-header">
          <div class="history-plan-name">${r.planName || '未知计划'}</div>
          <div style="display:flex;align-items:center;gap:8px">
            ${badge}
            <div class="history-time">${Utils.formatTime(r.timestamp || r.createdAt)}</div>
          </div>
        </div>
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">
          ${r.completedSets || 0} 组 · ${r.duration || 0} 分钟
        </div>
        <div class="history-exercises">${exHtml}</div>
      </div>`;
  }).join('');
}

function selectHistoryDate(date) {
  State.selectedHistoryDate = date;
  document.querySelectorAll('.calendar-day').forEach(el => el.classList.remove('selected'));
  // 找到对应cell并标记
  event.currentTarget.classList.add('selected');
  document.querySelector('.section-title').textContent = `${Utils.formatDate(date)} 记录`;
  loadHistoryDetail(date);
}

function changeHistoryMonth(delta) {
  let { year, month } = State.historyMonth;
  month += delta;
  if (month > 11) { month = 0; year++; }
  if (month < 0) { month = 11; year--; }
  State.historyMonth = { year, month };
  renderHistory();
}
