/**
 * FitTracker - 主应用逻辑 v4
 * 核心改动：每日训练计划系统（每天创建当日计划，第二天不显示旧计划）
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
    return `${parseInt(m)}月${parseInt(d)}日`;
  },
  formatFullDate(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${y}年${parseInt(m)}月${parseInt(d)}日`;
  },
  formatTime(ts) {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  },
  getMonthDays(year, month) { return new Date(year, month + 1, 0).getDate(); },
  getFirstDayOfMonth(year, month) { return new Date(year, month, 1).getDay(); },
  dateAdd(dateStr, days) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },
  weekdays: ['日','一','二','三','四','五','六'],
  greetings() {
    const h = new Date().getHours();
    if (h < 6) return '深夜了，注意休息 🌙';
    if (h < 10) return '早上好，今天练什么？☀️';
    if (h < 12) return '上午好，准备开练！💪';
    if (h < 14) return '中午了，训练加油！🔥';
    if (h < 18) return '下午好，保持动力！⚡';
    if (h < 21) return '晚上好，今日训练！🌟';
    return '晚了，完成今日计划吧 🌙';
  }
};

// ===== 多强度分组辅助函数 =====
function normalizeExercise(ex) {
  if (ex.intensityGroups && ex.intensityGroups.length > 0) return ex;
  return { ...ex, intensityGroups: [{ sets: ex.sets || 3, reps: ex.reps || 10, weight: ex.weight || 0 }] };
}

function totalSetsForExercise(ex) {
  const nex = normalizeExercise(ex);
  return nex.intensityGroups.reduce((s, g) => s + g.sets, 0);
}

function exerciseSpecText(ex) {
  const nex = normalizeExercise(ex);
  if (nex.intensityGroups.length === 1) {
    const g = nex.intensityGroups[0];
    return `${g.sets}组 × ${g.reps}次${g.weight ? ' · ' + g.weight + 'kg' : ''}`;
  }
  return nex.intensityGroups.map((g, i) =>
    `强度${i+1}: ${g.sets}×${g.reps}${g.weight ? '/' + g.weight + 'kg' : ''}`
  ).join('，');
}

function exerciseChipText(ex) {
  const nex = normalizeExercise(ex);
  if (nex.intensityGroups.length === 1) {
    const g = nex.intensityGroups[0];
    return `${g.sets}×${g.reps}`;
  }
  return nex.intensityGroups.map(g => `${g.sets}×${g.reps}`).join('+');
}

// ===== 全局状态 =====
const State = {
  currentPage: 'today',
  theme: localStorage.getItem('theme') || 'light',
  historyMonth: { year: new Date().getFullYear(), month: new Date().getMonth() },
  statsTab: 'week',
  statsChart: null,
  activeSessions: {},
  currentExerciseView: null,
};

// ===== Toast =====
function showToast(msg, duration = 2000) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  t.classList.add('show');
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.classList.add('hidden'), 300); }, duration);
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
document.getElementById('themeToggle').onclick = () => { applyTheme(State.theme === 'dark' ? 'light' : 'dark'); };
applyTheme(State.theme);

// ===== 底部导航 =====
document.getElementById('bottomNav').addEventListener('click', e => {
  const item = e.target.closest('.nav-item');
  if (!item) return;
  const page = item.dataset.page;
  if (page === State.currentPage) return;
  if (State.currentExerciseView) { State.currentExerciseView = null; }
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  item.classList.add('active');
  State.currentPage = page;
  renderPage(page);
});

// ===== 页面路由 =====
async function renderPage(page) {
  const main = document.getElementById('appMain');
  main.innerHTML = '';
  if (State.currentExerciseView) { await renderExerciseDetail(); return; }
  switch (page) {
    case 'today': await renderToday(); break;
    case 'plans': await renderPlans(); break;
    case 'history': await renderHistory(); break;
    case 'stats': await renderStats(); break;
    case 'settings': await renderSettings(); break;
  }
}

// ===== 今日页面（只显示当天计划） =====
async function renderToday() {
  const main = document.getElementById('appMain');
  const today = Utils.today();
  // 关键：只获取当天的计划！
  const todayPlans = await DB.plans.getByDate(today);
  const todayRecords = await DB.records.getByDate(today);
  const todayCheckin = await DB.checkins.get(today);
  const allCheckins = await DB.checkins.getAll();

  let streak = 0;
  let checkDate = today;
  while (true) {
    const ci = allCheckins.find(c => c.date === checkDate);
    if (ci && ci.completed) { streak++; checkDate = Utils.dateAdd(checkDate, -1); }
    else break;
  }

  // 统计数据：合并 records 和活跃 session 的数据（确保实时显示最新进度）
  let totalSets = todayRecords.reduce((s, r) => s + (r.completedSets || 0), 0);
  let totalExs = todayRecords.reduce((s, r) => s + (r.completedExercises ? r.completedExercises.length : 0), 0);

  // 如果有活跃的训练 session，用 session 数据覆盖 record 数据（session 更新）
  for (const rec of todayRecords) {
    const sess = State.activeSessions[rec.planId];
    if (!sess) continue;
    // 用 session 数据重新计算这个计划的总组数和完成动作数
    const plan = await DB.plans.get(rec.planId);
    if (!plan) continue;
    const exercises = (plan.exercises||[]).map(normalizeExercise);
    let sessTotalSets = 0;
    let sessCompletedExIds = [];
    for (const ex of exercises) {
      const ed = sess.exercises[String(ex.id)];
      if (ed) {
        const ds = ed.totalDoneSets || 0;
        sessTotalSets += ds;
        if (ds >= totalSetsForExercise(ex)) sessCompletedExIds.push(ex.id);
      }
    }
    // 减去旧 record 数据，加上新的 session 数据
    totalSets = totalSets - (rec.completedSets||0) + sessTotalSets;
    totalExs = totalExs - (rec.completedExercises||[]).length + sessCompletedExIds.length;
  }
  const completedPlans = todayRecords.filter(r => r.completed).length;

  let html = `<div class="page-enter">`;

  // 问候语
  html += `
    <div class="today-greeting">
      <div class="greeting-text">${Utils.greetings()}</div>
      <div class="greeting-date">${Utils.formatFullDate(today)} · ${['周日','周一','周二','周三','周四','周五','周六'][new Date().getDay()]}</div>
    </div>`;

  // 连击
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

  // 统计卡片（有数据才显示）
  if (todayPlans.length > 0 || completedPlans > 0) {
    html += `
    <div class="today-stats">
      <div class="stat-card"><div class="stat-value">${completedPlans}</div><div class="stat-label">完成计划</div></div>
      <div class="stat-card"><div class="stat-value">${totalExs}</div><div class="stat-label">完成动作</div></div>
      <div class="stat-card"><div class="stat-value">${totalSets}</div><div class="stat-label">完成组数</div></div>
    </div>`;
  }

  // 核心逻辑：没有当天计划 → 显示创建入口；有计划 → 显示训练列表
  if (todayPlans.length === 0) {
    html += `
      <div class="no-plan-today card" style="margin-top:8px">
        <div class="empty-icon" style="font-size:56px">🏋️</div>
        <div class="empty-title" style="font-size:18px">今天还没有训练计划</div>
        <div class="empty-desc">创建今天的训练计划，开始打卡记录</div>
        <button class="btn btn-primary btn-lg btn-block" onclick="showCreateDailyPlanModal()" style="margin-top:20px;padding:16px;font-size:16px;border-radius:14px;background:linear-gradient(135deg,#6366f1,#a855f7)">
          ✨ 创建今日训练计划
        </button>
      </div>`;
  } else {
    html += `<div class="section-header"><span class="section-title">今日训练 (${todayPlans.length}个计划)</span>`;
    html += `<button class="btn btn-outline btn-sm" onclick="showCreateDailyPlanModal()">+ 新增</button></div>`;

    for (const plan of todayPlans) {
      const record = todayRecords.find(r => r.planId === plan.id) || null;
      html += renderTodayPlanCard(plan, record, today);
    }
  }

  html += `</div>`;
  main.innerHTML = html;
}

// 创建当日计划的快捷入口
function showCreateDailyPlanModal() {
  switchPage('plans');
  // 延迟一点打开模态框，等页面渲染完
  setTimeout(() => showPlanModal(null), 300);
}

function renderTodayPlanCard(plan, record, today) {
  const exercises = (plan.exercises || []).map(normalizeExercise);
  const session = State.activeSessions[plan.id];

  // 关键修复：即使 record.completed=true，如果有新加的动作不在记录中，计划不算全部完成
  let doneSetsMap = {};
  let completedExIds = new Set();

  if (session) {
    doneSetsMap = session.exercises || {};
    completedExIds = new Set(Object.keys(doneSetsMap).filter(id => {
      const exData = doneSetsMap[id];
      const ex = exercises.find(e => String(e.id) === id);
      return exData && (exData.totalDoneSets || 0) >= totalSetsForExercise(ex);
    }));
  } else if (record) {
    // 从记录恢复已完成动作ID
    (record.completedExercises || []).forEach(exId => {
      // 只标记当前计划中仍然存在的动作
      if (exercises.find(e => e.id === exId || String(e.id) === String(exId))) {
        completedExIds.add(String(exId));
      }
    });
    const rawMap = record.setsMap || {};
    const newMap = {};
    for (const [exIdStr, val] of Object.entries(rawMap)) {
      // 只恢复当前计划中仍然存在的动作数据
      if (!exercises.find(e => String(e.id) === exIdStr)) continue;
      if (typeof val === 'number') {
        const ex = exercises.find(e => String(e.id) === exIdStr);
        newMap[exIdStr] = { totalDoneSets: val, groups: ex ? ex.intensityGroups.map(g => ({ doneSets: 0, doneRepsPerSet: [] })) : [] };
      } else { newMap[exIdStr] = val; }
    }
    doneSetsMap = newMap;
  }

  // 检查是否有新加的动作不在已完成列表中
  const hasNewExercises = exercises.some(ex => !completedExIds.has(String(ex.id)));
  // 完成状态：所有动作都完成了才算真正完成
  const isFullyCompleted = record && record.completed && !hasNewExercises;
  // 有部分完成的记录但新加了动作 → 状态变为"继续训练"
  const hasPartialRecord = record && hasNewExercises;

  const totalEx = exercises.length;
  const doneEx = completedExIds.size;
  const progress = totalEx > 0 ? Math.round((doneEx / totalEx) * 100) : 0;

  let statusBadge = '';
  if (isFullyCompleted) statusBadge = `<span class="plan-badge done">已完成 ✓</span>`;
  else if (hasPartialRecord) statusBadge = `<span class="plan-badge active">继续训练</span>`;
  else if (session) statusBadge = `<span class="plan-badge active">训练中</span>`;
  else statusBadge = `<span class="plan-badge">未开始</span>`;

  let exHtml = exercises.map(ex => {
    const exIdStr = String(ex.id);
    const isDone = completedExIds.has(exIdStr);
    const exData = doneSetsMap[exIdStr];
    const totalSetsVal = totalSetsForExercise(ex);
    const doneSetsVal = exData ? (exData.totalDoneSets || 0) : 0;

    let groupsInfo = '';
    if (ex.intensityGroups.length > 1) {
      groupsInfo = `<div class="intensity-group-list">`;
      ex.intensityGroups.forEach((g, gi) => {
        const groupData = exData && exData.groups ? exData.groups[gi] : null;
        const gDone = groupData ? groupData.doneSets : 0;
        groupsInfo += `<div class="intensity-group-item ${gDone >= g.sets ? 'done-group' : ''}">
          <span class="ig-label ${gDone >= g.sets ? 'done-label' : ''}">强度${gi+1}</span>
          <span class="ig-detail">${g.sets}×${g.reps}${g.weight ? '/' + g.weight + 'kg' : ''}</span>
          <span class="ig-progress ${gDone >= g.sets ? 'done-progress' : ''}">${gDone}/${g.sets}</span>
        </div>`;
      });
      groupsInfo += `</div>`;
    }

    // 关键修复：只有全部完成（无新动作）时才禁用点击；未完成的动作始终可点击
    const canClick = !isFullyCompleted || !isDone;

    return `
      <div class="exercise-tile ${isDone ? 'completed' : ''}" 
           onclick="${canClick ? `openExerciseDetail(${plan.id}, ${ex.id})` : ''}"
           id="ex-tile-${plan.id}-${ex.id}">
        <div class="exercise-tile-left">
          <div class="exercise-tile-check ${isDone ? 'checked' : ''}">${isDone ? '✓' : ''}</div>
          <div class="exercise-tile-info">
            <div class="exercise-tile-name">${ex.name}</div>
            <div class="exercise-tile-detail">${exerciseSpecText(ex)}</div>
            ${groupsInfo}
          </div>
        </div>
        <div class="exercise-tile-right">
          <div class="exercise-tile-progress-mini">
            <div class="mini-progress-bar" style="width:${Math.round((doneSetsVal/totalSetsVal)*100)}%"></div>
          </div>
          <div class="exercise-tile-sets">${doneSetsVal}/${totalSetsVal}</div>
          ${canClick ? '<div class="exercise-tile-go">›</div>' : ''}
        </div>
      </div>`;
  }).join('');

  const allDone = doneEx === totalEx && totalEx > 0;
  const checkinBtnLabel = isFullyCompleted ? '已打卡 ✓' : allDone ? '完成训练 打卡！' : `训练进行中 (${doneEx}/${totalEx})`;

  return `
    <div class="plan-card" id="plan-card-${plan.id}">
      <div class="plan-header"><div class="plan-name">${plan.name}</div>${statusBadge}</div>
      <div class="progress-wrap"><div class="progress-bar" id="prog-${plan.id}" style="width:${progress}%"></div></div>
      <div class="exercise-tiles">${exHtml}</div>
      <div class="checkin-btn-wrap">
        <button class="checkin-btn ${isFullyCompleted ? 'done-btn' : allDone ? 'all-done-btn' : ''}" 
                id="checkin-btn-${plan.id}" onclick="checkIn(${plan.id}, '${today}')"
                ${isFullyCompleted ? 'disabled' : ''}>${checkinBtnLabel}</button>
      </div>
    </div>`;
}

// ===== 动作详情页面 =====
async function openExerciseDetail(planId, exId) {
  State.currentExerciseView = { planId, exId };
  await renderExerciseDetail();
}

async function renderExerciseDetail() {
  const { planId, exId } = State.currentExerciseView;
  if (!planId || !exId) { State.currentExerciseView = null; await renderToday(); return; }

  const plan = await DB.plans.get(planId);
  if (!plan) { State.currentExerciseView = null; await renderToday(); return; }
  const ex = normalizeExercise(plan.exercises.find(e => e.id === exId));
  if (!ex) { State.currentExerciseView = null; await renderToday(); return; }

  // 如果没有活跃session，从已有记录恢复数据（支持编辑后继续训练）
  if (!State.activeSessions[planId]) {
    const today = Utils.today();
    const existingRecords = await DB.records.getByDate(today);
    const existingRecord = existingRecords.find(r => r.planId === planId);
    
    const session = { exercises: {}, startTime: existingRecord ? (existingRecord.timestamp || Date.now()) : Date.now() };
    
    // 从记录恢复已完成动作的数据
    if (existingRecord && existingRecord.setsMap) {
      const exercises = plan.exercises.map(normalizeExercise);
      for (const [exIdStr, val] of Object.entries(existingRecord.setsMap)) {
        const exInPlan = exercises.find(e => String(e.id) === exIdStr);
        if (!exInPlan) continue; // 记录中的动作已被删除，跳过
        
        if (typeof val === 'number') {
          session.exercises[exIdStr] = {
            totalDoneSets: val,
            groups: exInPlan.intensityGroups.map(g => ({ doneSets: 0, doneRepsPerSet: [], targetSets: g.sets, targetReps: g.reps, targetWeight: g.weight || 0 }))
          };
        } else {
          session.exercises[exIdStr] = {
            totalDoneSets: val.totalDoneSets || 0,
            groups: (val.groups || []).map(g => ({ doneSets: g.doneSets || 0, doneRepsPerSet: g.doneRepsPerSet || [], targetSets: g.targetSets || 0, targetReps: g.targetReps || 0, targetWeight: g.targetWeight || 0 }))
          };
        }
      }
    }
    
    State.activeSessions[planId] = session;
  }
  
  const session = State.activeSessions[planId];
  const exIdStr = String(exId);

  // 初始化新动作的session数据（支持编辑后新增动作打卡）
  if (!session.exercises[exIdStr]) {
    session.exercises[exIdStr] = {
      totalDoneSets: 0,
      groups: ex.intensityGroups.map(g => ({ doneSets: 0, doneRepsPerSet: [], targetSets: g.sets, targetReps: g.reps, targetWeight: g.weight || 0 }))
    };
  }
  const exData = session.exercises[exIdStr];

  let currentGroupIdx = 0;
  let currentSetInGroup = 0;
  let totalDoneSets = exData.totalDoneSets;
  const totalSets = totalSetsForExercise(ex);
  const allDone = totalDoneSets >= totalSets;

  for (let gi = 0; gi < exData.groups.length; gi++) {
    const g = exData.groups[gi];
    if (g.doneSets < g.targetSets) { currentGroupIdx = gi; currentSetInGroup = g.doneSets; break; }
    currentGroupIdx = gi + 1;
  }
  if (currentGroupIdx >= ex.intensityGroups.length) currentGroupIdx = ex.intensityGroups.length - 1;

  const exercises = plan.exercises.map(normalizeExercise);
  const doneCount = exercises.filter(e => {
    const data = session.exercises[String(e.id)];
    return data && (data.totalDoneSets || 0) >= totalSetsForExercise(e);
  }).length;

  const main = document.getElementById('appMain');

  // 已完成的组列表
  let completedSetsHtml = '';
  for (let gi = 0; gi < exData.groups.length; gi++) {
    const g = exData.groups[gi];
    for (let si = 0; si < g.doneSets; si++) {
      const repsVal = g.doneRepsPerSet[si] || g.targetReps;
      completedSetsHtml += `<div class="set-done-row">
        <div class="set-done-num">强度${gi+1} · 第${si+1}组</div>
        <div class="set-done-reps">${repsVal}次${g.targetWeight ? ' · ' + g.targetWeight + 'kg' : ''} ✓</div>
      </div>`;
    }
  }

  // 强度分组进度概览
  let groupProgressHtml = '';
  if (ex.intensityGroups.length > 1) {
    groupProgressHtml = `<div class="group-progress-section">
      <div class="group-progress-title">强度分组进度</div>
      ${ex.intensityGroups.map((g, gi) => {
        const gData = exData.groups[gi];
        const gDone = gData.doneSets;
        const gTotal = g.sets;
        const isGroupDone = gDone >= gTotal;
        const isCurrent = gi === currentGroupIdx && !allDone;
        return `<div class="group-progress-row">
          <span class="gp-label ${isGroupDone ? 'done' : ''}">强度${gi+1}</span>
          <span class="gp-spec">${g.sets}×${g.reps}${g.weight ? '/' + g.weight + 'kg' : ''}</span>
          <span class="gp-status ${isGroupDone ? 'done' : isCurrent ? 'current' : ''}">${isGroupDone ? '✓ 完成' : isCurrent ? gDone + '/' + gTotal + '组' : '未开始'}</span>
        </div>`;
      }).join('')}
    </div>`;
  }

  const currentGroup = ex.intensityGroups[currentGroupIdx] || ex.intensityGroups[0];
  const currentSetNum = currentSetInGroup + 1;

  main.innerHTML = `<div class="page-enter exercise-detail-page">
    <div class="exercise-detail-header">
      <button class="btn-back" onclick="backFromExercise()"><span class="back-arrow">←</span> 返回训练</button>
      <div class="exercise-detail-progress-badge">${doneCount}/${exercises.length} 动作</div>
    </div>

    <div class="exercise-detail-name">${ex.name}</div>
    <div class="exercise-detail-spec">目标 ${exerciseSpecText(ex)}</div>

    <div class="exercise-ring-wrap">
      <div class="exercise-ring" id="exerciseRing" style="background:conic-gradient(var(--primary) 0% ${Math.round((totalDoneSets/totalSets)*100)}%, var(--bg-secondary) ${Math.round((totalDoneSets/totalSets)*100)}% 100%)">
        <div class="exercise-ring-inner">
          <div class="exercise-ring-value">${totalDoneSets}</div>
          <div class="exercise-ring-label">/${totalSets}组</div>
        </div>
      </div>
    </div>

    ${groupProgressHtml}

    ${!allDone ? `
    <div class="current-set-section">
      <div class="current-set-label">强度${currentGroupIdx+1} · 第 ${currentSetNum} 组</div>
      <button class="big-checkin-btn" onclick="completeOneSet(${planId}, ${exId})">
        <div class="big-checkin-icon">💪</div>
        <div class="big-checkin-text">完成第 ${totalDoneSets+1} 组</div>
        <div class="big-checkin-sub">${currentGroup.reps}次${currentGroup.weight ? ' · ' + currentGroup.weight + 'kg' : ''} (强度${currentGroupIdx+1})</div>
      </button>
    </div>` : `
    <div class="all-sets-done-section">
      <div class="all-sets-done-icon">🎉</div>
      <div class="all-sets-done-text">${ex.name} 全部完成！</div>
      <button class="btn btn-primary btn-lg btn-block" onclick="backFromExercise()">返回训练列表 →</button>
    </div>`}

    ${totalDoneSets > 0 ? `<div class="sets-done-scroll"><div class="sets-done-title">已完成 ${totalDoneSets} 组</div>${completedSetsHtml}</div>` : ''}

    <div class="exercise-nav-section">
      <div class="exercise-nav-title">其他动作</div>
      <div class="exercise-nav-list">
        ${exercises.map(e => {
          const isCurrent = e.id === exId;
          const data = session.exercises[String(e.id)];
          const eTotal = totalSetsForExercise(e);
          const eDone = data ? (data.totalDoneSets || 0) : 0;
          const done = eDone >= eTotal;
          return `<div class="exercise-nav-item ${isCurrent ? 'current' : ''} ${done ? 'done' : ''}" 
                   onclick="${!isCurrent ? `openExerciseDetail(${planId}, ${e.id})` : ''}">
            <div class="nav-item-dot ${done ? 'done' : ''}"></div>
            <div class="nav-item-name">${e.name}</div>
            <div class="nav-item-sets">${eDone}/${eTotal}</div>
          </div>`;
        }).join('')}
      </div>
    </div>
  </div>`;
}

async function completeOneSet(planId, exId) {
  const session = State.activeSessions[planId];
  const exIdStr = String(exId);
  const exData = session.exercises[exIdStr];
  let targetGroupIdx = 0;
  for (let gi = 0; gi < exData.groups.length; gi++) {
    if (exData.groups[gi].doneSets < exData.groups[gi].targetSets) { targetGroupIdx = gi; break; }
  }
  const g = exData.groups[targetGroupIdx];
  g.doneRepsPerSet.push(g.targetReps);
  g.doneSets++;
  exData.totalDoneSets++;
  showToast(`✓ 强度${targetGroupIdx+1} 第${g.doneSets}组完成！`, 1500);

  // 自动保存训练进度到 IndexedDB（防止页面关闭/刷新丢失数据）
  await autoSaveProgress(planId);

  // 自动保存到文件（如果已绑定文件夹）
  if (FileSync._dirHandle) {
    FileSync.saveToFile(); // 不阻塞，后台保存
  }

  renderExerciseDetail();
}

// 自动保存当前训练进度（每组打卡后自动调用）
async function autoSaveProgress(planId) {
  try {
    const session = State.activeSessions[planId];
    if (!session) return;
    const plan = await DB.plans.get(planId);
    if (!plan) return;
    const date = Utils.today();
    const exercises = (plan.exercises || []).map(normalizeExercise);

    // 从session构建setsMap和completedExercises
    const completedExercises = [], setsMap = {};
    let totalSets = 0;

    exercises.forEach(ex => {
      const exIdStr = String(ex.id);
      const exData = session.exercises[exIdStr];
      const totalTargetSets = totalSetsForExercise(ex);
      if (exData) {
        const doneSets = exData.totalDoneSets || 0;
        totalSets += doneSets;
        setsMap[exIdStr] = {
          totalDoneSets: doneSets,
          exName: ex.name,
          weight: ex.intensityGroups[0].weight||0,
          targetSets: totalTargetSets,
          targetReps: ex.intensityGroups[0].reps,
          groups: (exData.groups||[]).map((g, gi) => ({
            doneSets: g.doneSets||0,
            doneRepsPerSet: g.doneRepsPerSet||[],
            targetSets: g.targetSets||ex.intensityGroups[gi].sets,
            targetReps: g.targetReps||ex.intensityGroups[gi].reps,
            targetWeight: g.targetWeight||ex.intensityGroups[gi].weight||0
          }))
        };
        if (doneSets >= totalTargetSets) completedExercises.push(ex.id);
      } else {
        setsMap[exIdStr] = {
          totalDoneSets: 0,
          exName: ex.name,
          weight: ex.intensityGroups[0].weight||0,
          targetSets: totalTargetSets,
          targetReps: ex.intensityGroups[0].reps,
          groups: ex.intensityGroups.map(g=>({ doneSets:0, doneRepsPerSet:[], targetSets:g.sets, targetReps:g.reps, targetWeight:g.weight||0 }))
        };
      }
    });

    const allCompleted = completedExercises.length === exercises.length && exercises.length > 0;

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
      duration: Math.round((Date.now()-(session.startTime||Date.now()))/60000),
      timestamp: Date.now()
    };

    if (existingRecord) {
      await DB.records.update({...existingRecord, ...recordData});
    } else {
      await DB.records.add(recordData);
    }

    // 同步更新每日打卡摘要
    const allRecs = await DB.records.getByDate(date);
    const allDayPlans = await DB.plans.getByDate(date);
    const allPlansDone = allDayPlans.every(p => {
      const r = allRecs.find(rec => rec.planId === p.id);
      return r && r.completed;
    });

    await DB.checkins.put({
      date,
      completed: allPlansDone,
      planCount: allDayPlans.length,
      completedPlanCount: allRecs.filter(r => r.completed).length,
      totalSets: allRecs.reduce((s,r)=>s+(r.completedSets||0),0),
      timestamp: Date.now()
    });
  } catch(e) {
    console.error('autoSaveProgress error:', e);
  }
}

async function backFromExercise() { State.currentExerciseView = null; await renderToday(); }

function switchPage(page) {
  if (State.currentExerciseView) { State.currentExerciseView = null; }
  document.querySelectorAll('.nav-item').forEach(n => { n.classList.toggle('active', n.dataset.page === page); });
  State.currentPage = page;
  renderPage(page);
}

// ===== 计划页面（管理所有计划 / 创建今日计划） =====
async function renderPlans() {
  const main = document.getElementById('appMain');
  const allPlans = await DB.plans.getAll();
  const today = Utils.today();
  const todayPlans = allPlans.filter(p => p.date === today);

  // 按日期分组
  const planGroups = {};
  for (const p of allPlans) {
    const d = p.date || '未知日期';
    if (!planGroups[d]) planGroups[d] = [];
    planGroups[d].push(p);
  }
  // 按日期倒序排列
  const sortedDates = Object.keys(planGroups).sort().reverse();

  let html = `<div class="page-enter">`;

  // 今日快捷创建按钮
  if (todayPlans.length === 0) {
    html += `<button class="btn btn-primary btn-lg btn-block" onclick="showPlanModal(null)" style="padding:18px;font-size:17px;margin-bottom:20px;border-radius:14px;background:linear-gradient(135deg,#6366f1,#a855f7);box-shadow:0 6px 20px rgba(99,102,241,0.4)">
      ✨ 创建今日训练计划 (${Utils.formatDate(today)})
    </button>`;
  } else {
    html += `<div class="section-header"><span class="section-title">今日计划 (${todayPlans.length})</span><button class="btn btn-primary btn-sm" onclick="showPlanModal(null)">+ 新增</button></div>`;
    for (const p of todayPlans) {
      const exChips = (p.exercises||[]).map(normalizeExercise).map(ex =>
        `<span class="exercise-chip">${ex.name} ${exerciseChipText(ex)}</span>`).join('');
      html += `<div class="plan-item" style="border-left:3px solid var(--primary)">
        <div class="plan-item-header"><div class="plan-item-info"><div class="plan-item-name">${p.name}</div>
        <div class="plan-item-meta">${(p.exercises||[]).length}个动作 · ${p.description||''}</div></div>
        <div class="plan-item-actions">
          <button class="btn btn-ghost btn-sm" onclick="showEditPlanModal(${p.id})">编辑</button>
          <button class="btn btn-danger btn-sm" onclick="deletePlan(${p.id})">删除</button>
        </div></div>
        <div class="exercise-chips">${exChips}</div>
      </div>`;
    }
  }

  // 历史计划列表
  const pastDates = sortedDates.filter(d => d !== today);
  if (pastDates.length > 0) {
    html += `<div class="section-header" style="margin-top:20px"><span class="section-title">历史计划</span></div>`;
    for (const date of pastDates) {
      const dayPlans = planGroups[date];
      const isToday = date === today;
      html += `<div class="card" style="margin-bottom:12px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <span style="font-weight:700;color:var(--text-secondary);font-size:13px">${Utils.formatFullDate(date)} · ${dayPlans.length}个计划</span>
        </div>`;
      for (const p of dayPlans) {
        const recs = await DB.records.getAll();
        const rec = recs.find(r => r.planId === p.id);
        const statusTag = rec?.completed ? '<span class="plan-badge done" style="font-size:11px;padding:2px8px">已完成</span>' : rec ? '<span class="plan-badge active" style="font-size:11px;padding:2px8px">部分完成</span>' : '';
        const exChips = (p.exercises||[]).map(normalizeExercise).map(ex => `<span class="exercise-chip">${ex.name} ${exerciseChipText(ex)}</span>`).join('');
        html += `<div class="plan-item" style="background:var(--bg-secondary)">
          <div class="plan-item-header"><div class="plan-item-info">
            <div class="plan-item-name">${p.name}</div>
            <div class="plan-item-meta">${(p.exercises||[]).length}个动作</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">${statusTag}
            <button class="btn btn-ghost btn-sm" onclick="showEditPlanModal(${p.id})">查看</button>
          </div></div>
          <div class="exercise-chips">${exChips}</div>
        </div>`;
      }
      html += `</div>`;
    }
  } else if (todayPlans.length > 0) {
    html += `<div class="empty-state" style="padding:30px 20px">
      <div class="empty-icon">📅</div>
      <div class="empty-title">暂无历史计划</div>
      <div class="empty-desc">每天的训练计划会保存在这里</div>
    </div>`;
  }

  html += `</div>`;
  main.innerHTML = html;
}

// ===== 新建/编辑计划模态框（支持多强度分组）=====
function showAddPlanModal() { showPlanModal(null); }
async function showEditPlanModal(planId) { const plan = await DB.plans.get(planId); showPlanModal(plan); }

let _modalExercises = [];

function showPlanModal(plan) {
  _modalExercises = plan
    ? JSON.parse(JSON.stringify(plan.exercises || [])).map(normalizeExercise)
    : [];
  const isEdit = !!plan;

  const exListHtml = () => _modalExercises.map((ex, i) => {
    const spec = exerciseSpecText(ex);
    return `<div class="edit-exercise-item" id="edit-ex-${i}" style="flex-direction:column;align-items:flex-start;gap:6px">
      <div style="display:flex;align-items:center;gap:8px;width:100%">
        <div class="edit-exercise-name">${ex.name}</div>
        <div class="edit-exercise-detail">${spec}</div>
        <button class="btn btn-icon btn-ghost" onclick="removeEditExercise(${i})" style="font-size:16px;color:var(--danger)">×</button>
      </div>
    </div>`;
  }).join('');

  const html = `
    <div class="modal-drag-handle"></div>
    <div class="modal-title">${isEdit ? '编辑训练计划' : '新建今日训练计划'}</div>
    <div class="form-group">
      <label class="form-label">计划名称 *</label>
      <input class="form-input" id="planName" placeholder="例如：胸部训练、腿部训练" value="${plan ? plan.name : ''}">
    </div>
    <div class="form-group">
      <label class="form-label">备注描述</label>
      <input class="form-input" id="planDesc" placeholder="可选：计划说明" value="${plan ? (plan.description||'') : ''}">
    </div>
    <div class="section-header" style="margin-bottom:8px"><span class="section-title" style="font-size:14px">训练动作</span></div>
    <div id="editExList">${exListHtml()}</div>
    <div id="addExerciseSection" style="background:var(--bg-secondary);border-radius:var(--radius-sm);padding:12px;margin-bottom:16px">
      <div style="font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:8px">添加动作</div>
      <div class="form-group" style="margin-bottom:8px"><input class="form-input" id="newExName" placeholder="动作名称，如：俯卧撑"></div>
      <div class="form-group" style="margin-bottom:4px">
        <label class="form-label">强度分组（同一动作可设置不同组数/次数/重量）</label>
      </div>
      <div id="addGroupsContainer">
        <div class="group-edit-section" data-group-idx="0">
          <div class="group-edit-header"><span>强度 1</span></div>
          <div class="group-edit-row">
            <div class="group-edit-field"><label>组数</label><input class="form-input" id="newG0Sets" type="number" min="1" value="3" placeholder="组"></div>
            <div class="group-edit-field"><label>次数</label><input class="form-input" id="newG0Reps" type="number" min="1" value="10" placeholder="次"></div>
            <div class="group-edit-field"><label>重量</label><input class="form-input" id="newG0Weight" type="number" min="0" placeholder="kg"></div>
          </div>
        </div>
      </div>
      <button class="group-add-btn" onclick="addNewGroupRow()">+ 增加一组强度</button>
      <div style="margin-top:8px">
        <div class="form-group" style="margin-bottom:8px"><input class="form-input" id="newExNote" placeholder="备注（可选）"></div>
        <button class="btn btn-outline btn-block btn-sm" onclick="addEditExercise()">+ 添加该动作</button>
      </div>
    </div>
    <div style="display:flex;gap:10px">
      <button class="btn btn-ghost btn-block" onclick="Modal.close()">取消</button>
      <button class="btn btn-primary btn-block" onclick="savePlan(${plan ? plan.id : 'null'})">${isEdit ? '保存更改' : '创建计划'}</button>
    </div>`;

  Modal.show(html);
}

let _newGroupCount = 1;

function addNewGroupRow() {
  _newGroupCount++;
  const idx = _newGroupCount - 1;
  const container = document.getElementById('addGroupsContainer');
  const section = document.createElement('div');
  section.className = 'group-edit-section';
  section.dataset.groupIdx = idx;
  section.innerHTML = `
    <div class="group-edit-header"><span>强度 ${idx+1}</span><button class="group-edit-remove" onclick="removeNewGroupRow(this)">×</button></div>
    <div class="group-edit-row">
      <div class="group-edit-field"><label>组数</label><input class="form-input" id="newG${idx}Sets" type="number" min="1" value="3" placeholder="组"></div>
      <div class="group-edit-field"><label>次数</label><input class="form-input" id="newG${idx}Reps" type="number" min="1" value="10" placeholder="次"></div>
      <div class="group-edit-field"><label>重量</label><input class="form-input" id="newG${idx}Weight" type="number" min="0" placeholder="kg"></div>
    </div>`;
  container.appendChild(section);
}

function removeNewGroupRow(btn) {
  const section = btn.closest('.group-edit-section'); section.remove(); _newGroupCount--;
  const sections = document.querySelectorAll('#addGroupsContainer .group-edit-section');
  sections.forEach((s, i) => {
    s.dataset.groupIdx = i;
    s.querySelector('.group-edit-header span').textContent = `强度 ${i+1}`;
    s.querySelectorAll('.form-input').forEach(input => { input.id = input.id.replace(/newG\d+/, `newG${i}`); });
  });
}

function addEditExercise() {
  const name = document.getElementById('newExName').value.trim();
  const note = document.getElementById('newExNote').value.trim();
  if (!name) { showToast('请输入动作名称'); return; }

  const groups = [];
  const sections = document.querySelectorAll('#addGroupsContainer .group-edit-section');
  sections.forEach(s => {
    const idx = parseInt(s.dataset.groupIdx);
    const sets = parseInt(document.getElementById(`newG${idx}Sets`).value) || 3;
    const reps = parseInt(document.getElementById(`newG${idx}Reps`).value) || 10;
    const weight = parseFloat(document.getElementById(`newG${idx}Weight`).value) || 0;
    groups.push({ sets, reps, weight });
  });
  if (groups.length === 0) { showToast('请至少添加一组强度'); return; }

  _modalExercises.push({ id: Date.now(), name, intensityGroups: groups, note });

  document.getElementById('newExName').value = '';
  document.getElementById('newExNote').value = '';
  _newGroupCount = 1;
  document.getElementById('addGroupsContainer').innerHTML = `
    <div class="group-edit-section" data-group-idx="0">
      <div class="group-edit-header"><span>强度 1</span></div>
      <div class="group-edit-row">
        <div class="group-edit-field"><label>组数</label><input class="form-input" id="newG0Sets" type="number" min="1" value="3" placeholder="组"></div>
        <div class="group-edit-field"><label>次数</label><input class="form-input" id="newG0Reps" type="number" min="1" value="10" placeholder="次"></div>
        <div class="group-edit-field"><label>重量</label><input class="form-input" id="newG0Weight" type="number" min="0" placeholder="kg"></div>
      </div>
    </div>`;

  refreshEditExList();
  showToast(`已添加：${name}`);
}

function refreshEditExList() {
  document.getElementById('editExList').innerHTML = _modalExercises.map((ex, i) => {
    const nex = normalizeExercise(ex);
    return `<div class="edit-exercise-item" id="edit-ex-${i}" style="flex-direction:column;align-items:flex-start;gap:6px">
      <div style="display:flex;align-items:center;gap:8px;width:100%">
        <div class="edit-exercise-name">${nex.name}</div>
        <div class="edit-exercise-detail">${exerciseSpecText(nex)}</div>
        <button class="btn btn-icon btn-ghost" onclick="removeEditExercise(${i})" style="font-size:16px;color:var(--danger)">×</button>
      </div>
    </div>`;
  }).join('');
}

function removeEditExercise(idx) { _modalExercises.splice(idx, 1); refreshEditExList(); }

async function savePlan(planId) {
  const name = document.getElementById('planName').value.trim();
  const description = document.getElementById('planDesc').value.trim();
  if (!name) { showToast('请输入计划名称'); return; }
  if (_modalExercises.length === 0) { showToast('请至少添加一个训练动作'); return; }

  const exercises = _modalExercises.map(normalizeExercise);
  // 核心：自动设置日期为今天
  const planData = { name, description, exercises, date: Utils.today() };

  if (planId) {
    // 编辑模式：检查是否有新动作被加入
    const existingPlan = await DB.plans.get(planId);
    let hasNewExercise = false;
    if (existingPlan && existingPlan.exercises) {
      const newExIds = exercises.map(e => String(e.id));
      const oldExIds = (existingPlan.exercises||[]).map(e => String(e.id));
      // 如果新计划中的动作ID不在旧计划中，说明有新动作
      for (const eid of newExIds) {
        if (!oldExIds.includes(eid)) { hasNewExercise = true; break; }
      }
    }

    await DB.plans.update({ ...planData, id: planId });

    // 如果有新动作加入且之前已打卡，重置记录状态为"未完成"
    if (hasNewExercise) {
      const today = Utils.today();
      const records = await DB.records.getByDate(today);
      const record = records.find(r => r.planId === planId);
      if (record && record.completed) {
        // 重置 completed 标志，但保留已完成的组数据
        record.completed = false;
        await DB.records.update(record);

        // 更新每日打卡摘要
        const allRecs = await DB.records.getByDate(today);
        const allDayPlans = await DB.plans.getByDate(today);
        const allPlansDone = allDayPlans.every(p => {
          const r = allRecs.find(rec => rec.planId === p.id);
          return r && r.completed;
        });

        await DB.checkins.put({
          date: today,
          completed: allPlansDone,
          planCount: allDayPlans.length,
          completedPlanCount: allRecs.filter(r => r.completed).length,
          totalSets: allRecs.reduce((s,r)=>s+(r.completedSets||0),0),
          timestamp: Date.now()
        });

        // 清除该计划的 session 数据，让用户重新训练新加的动作
        delete State.activeSessions[planId];

        showToast('计划已更新 ✓（检测到新动作，打卡状态已重置，需重新完成所有动作后打卡）');
      } else {
        showToast('计划已更新 ✓');
      }
    } else {
      showToast('计划已更新 ✓');
    }
  } else {
    await DB.plans.add(planData);
    showToast('今日计划已创建 ✓');
  }
  Modal.close();
  await renderPlans();
}

async function deletePlan(planId) {
  const plan = await DB.plans.get(planId);
  Modal.show(`<div class="modal-drag-handle"></div><div class="modal-title">删除计划</div><div class="confirm-dialog">
    <div class="confirm-message">确定要删除「<strong>${plan.name}</strong>」吗？<br>相关训练记录不会被删除。</div>
    <div class="confirm-actions">
      <button class="btn btn-ghost" onclick="Modal.close()">取消</button>
      <button class="btn btn-danger" onclick="confirmDeletePlan(${planId})">删除</button>
    </div></div>`);
}

async function confirmDeletePlan(planId) {
  await DB.plans.delete(planId); Modal.close(); showToast('已删除'); await renderPlans();
}

// ===== 历史页面（增强版 - 多强度分组详情） =====
async function renderHistory() {
  const main = document.getElementById('appMain');
  const { year, month } = State.historyMonth;
  const today = Utils.today();
  const allCheckins = await DB.checkins.getAll();

  const daysInMonth = Utils.getMonthDays(year, month);
  const firstDay = Utils.getFirstDayOfMonth(year, month);
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
    if (isCompleted) cls += ' completed-day'; else if (hasData) cls += ' has-data';
    if (isToday) cls += ' today'; if (isSelected) cls += ' selected';
    calHtml += `<div class="${cls}" onclick="selectHistoryDate('${dateStr}')">${d}</div>`;
  }

  const selectedDate = State.selectedHistoryDate || today;

  let html = `<div class="page-enter">
    <div class="card" style="margin-bottom:16px">
      <div class="calendar-nav"><button class="btn btn-ghost btn-sm" onclick="changeHistoryMonth(-1)">‹ 上月</button>
        <span class="calendar-month">${year}年${month+1}月</span>
        <button class="btn btn-ghost btn-sm" onclick="changeHistoryMonth(1)">下月 ›</button></div>
      <div class="calendar-grid">${calHtml}</div>
      <div style="display:flex;gap:12px;font-size:12px;color:var(--text-muted)">
        <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--success);opacity:0.6;margin-right:4px"></span>全部完成</span>
        <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--primary);margin-right:4px"></span>部分完成</span>
      </div>
    </div>
    <div class="section-header"><span class="section-title">${Utils.formatFullDate(selectedDate)} 训练记录</span></div>
    <div id="historyDetail" class="history-detail"></div>
  </div>`;

  main.innerHTML = html;
  await loadHistoryDetail(selectedDate);
}

async function loadHistoryDetail(date) {
  const container = document.getElementById('historyDetail');
  if (!container) return;

  // 获取当天的计划和记录
  const [records, dayPlans] = await Promise.all([DB.records.getByDate(date), DB.plans.getByDate(date)]);

  // 如果没有记录也没有计划
  if (records.length === 0 && dayPlans.length === 0) {
    container.innerHTML = `<div class="empty-state">
      <div class="empty-icon">📭</div>
      <div class="empty-title">当日无训练记录</div>
      <div class="empty-desc">选择其他日期查看</div>
    </div>`;
    return;
  }

  // 如果只有计划没有记录（创建了但没训练）
  if (dayPlans.length > 0 && records.length === 0) {
    container.innerHTML = dayPlans.map(p => {
      const exChips = (p.exercises||[]).map(normalizeExercise).map(ex =>
        `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:var(--bg-secondary);border-radius:var(--radius-sm);font-size:13px">
          <span style="font-weight:600">${ex.name}</span><span style="color:var(--text-muted)">${exerciseSpecText(ex)}</span>
        </div>`
      ).join('');
      return `<div class="history-record">
        <div class="history-record-header"><div class="history-plan-name">${p.name}</div>
        <span class="history-badge badge-partial">未训练</span></div>
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">${(p.exercises||[]).length} 个动作</div>
        <div class="history-exercise-list">${exChips}</div>
      </div>`;
    }).join('');
    return;
  }

  // 有训练记录
  container.innerHTML = records.map(r => {
    const badge = r.completed ? `<span class="history-badge badge-done">完成</span>` : `<span class="history-badge badge-partial">部分</span>`;
    const plan = dayPlans.find(p => p.id === r.planId);
    const exerciseDetails = [];
    const setsMap = r.setsMap || {};

    for (const [exIdStr, val] of Object.entries(setsMap)) {
      const ex = plan ? normalizeExercise(plan.exercises.find(e => String(e.id) === exIdStr)) : null;
      const exName = val.exName || (ex ? ex.name : '未知动作');
      const isDone = (r.completedExercises || []).includes(parseInt(exIdStr));

      let totalDoneSets, groupsDetail;
      if (typeof val === 'number') {
        totalDoneSets = val;
        groupsDetail = ex ? ex.intensityGroups.map(g => ({ doneSets: 0, targetSets: g.sets, targetReps: g.reps, targetWeight: g.weight })) : [];
      } else {
        totalDoneSets = val.totalDoneSets || val.doneSets || 0;
        if (val.groups && val.groups.length > 0) { groupsDetail = val.groups; }
        else { groupsDetail = ex ? ex.intensityGroups.map((g, gi) => ({ doneSets: gi===0?(val.doneSets||0):0, targetSets:g.sets, targetReps:g.reps, targetWeight:g.weight })) : []; }
      }
      exerciseDetails.push({ exName, isDone, totalDoneSets, groupsDetail, ex });
    }

    if (exerciseDetails.length === 0 && plan && r.completedExercises) {
      for (const exId of r.completedExercises) {
        const ex = normalizeExercise(plan.exercises.find(e => e.id === exId));
        if (ex) { exerciseDetails.push({ exName:ex.name, isDone:true, totalDoneSets:totalSetsForExercise(ex), groupsDetail:ex.intensityGroups.map(g=>({ doneSets:g.sets, targetSets:g.sets, targetReps:g.reps, targetWeight:g.weight })), ex }); }
      }
    }

    const exHtml = exerciseDetails.map(d => {
      // 始终显示强度分组详情（包括单强度动作）
      // 如果 groupsDetail 为空但从 plan 有数据，则从 plan 构建（兼容旧数据）
      let displayGroups = d.groupsDetail || [];
      if (displayGroups.length === 0 && d.ex && d.ex.intensityGroups) {
        displayGroups = d.ex.intensityGroups.map((ig, gi) => ({
          doneSets: gi === 0 ? d.totalDoneSets : 0,
          targetSets: ig.sets,
          targetReps: ig.reps,
          targetWeight: ig.weight || 0
        }));
      }
      let groupRows = '';
      if (d.ex && displayGroups.length > 0) {
        groupRows = displayGroups.map((g, gi) => {
          const ig = d.ex.intensityGroups[gi];
          const gDone = g.doneSets || 0;
          const gTotal = g.targetSets || ig.sets;
          const gReps = g.targetReps || ig.reps;
          const gWeight = g.targetWeight || ig.weight || 0;
          const isGroupDone = gDone >= gTotal;
          // 多强度显示"强度N"，单强度显示"规格"
          const label = d.ex.intensityGroups.length > 1 ? `强度${gi+1}` : '规格';
          return `<div class="history-group-row">
            <span class="hg-label ${isGroupDone ? 'done' : ''}">${label}</span>
            <span class="hg-detail">${gTotal}×${gReps}${gWeight ? '/'+gWeight+'kg' : ''}</span>
            <span class="hg-done">${isGroupDone ? '✓' : gDone+'/'+gTotal}</span>
          </div>`;
        }).join('');
      }
      const totalTargetSets = d.ex ? totalSetsForExercise(d.ex) : '?';
      return `<div class="history-exercise-row ${d.isDone?'done':'partial'}"><div class="history-ex-dot ${d.isDone?'done':''}"></div><div class="history-ex-name">${d.exName}</div><div class="history-ex-detail">${d.totalDoneSets}/${totalTargetSets}组 ${d.isDone?' ✓':''}</div></div>${groupRows}`;
    }).join('<>') || '<div style="font-size:13px;color:var(--text-muted)">无详情</div>';

    return `<div class="history-record">
      <div class="history-record-header"><div class="history-plan-name">${r.planName||'未知计划'}</div><div style="display:flex;align-items:center;gap:8px">${badge}<div class="history-time">${Utils.formatTime(r.timestamp||r.createdAt)}</div></div></div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">${r.completedSets||0} 组 · ${r.duration||0} 分钟</div>
      <div class="history-exercise-list">${exHtml.split('<>').join('')}</div>
    </div>`;
  }).join('');
}

function selectHistoryDate(date) {
  State.selectedHistoryDate = date;
  document.querySelectorAll('.calendar-day').forEach(el => el.classList.remove('selected'));
  event.currentTarget.classList.add('selected');
  document.querySelector('.section-title').textContent = `${Utils.formatFullDate(date)} 训练记录`;
  loadHistoryDetail(date);
}

function changeHistoryMonth(delta) {
  let { year, month } = State.historyMonth; month += delta;
  if (month > 11) { month = 0; year++; } if (month < 0) { month = 11; year--; }
  State.historyMonth = { year, month }; renderHistory();
}

// 获取或重建 session（防止 session 丢失导致数据全部清零）
async function getOrRecoverSession(planId, date) {
  const plan = await DB.plans.get(planId);
  if (!plan) return { exercises: {}, startTime: Date.now() };
  
  const exercises = (plan.exercises || []).map(normalizeExercise);
  
  // 如果 session 存在，更新它以包含新动作/移除已删除动作
  if (State.activeSessions[planId]) {
    const session = State.activeSessions[planId];
    // 为计划中的新动作初始化数据
    for (const ex of exercises) {
      const exIdStr = String(ex.id);
      if (!session.exercises[exIdStr]) {
        session.exercises[exIdStr] = { totalDoneSets:0, groups: ex.intensityGroups.map(g => ({ doneSets:0, doneRepsPerSet:[], targetSets:g.sets, targetReps:g.reps, targetWeight:g.weight||0 })) };
      }
    }
    // 移除已删除动作的数据（可选，不影响功能）
    return session;
  }
  
  // session 丢失，从已有记录恢复
  const existingRecords = await DB.records.getByDate(date);
  const existingRecord = existingRecords.find(r => r.planId === planId);
  const session = { exercises: {}, startTime: existingRecord ? (existingRecord.timestamp || Date.now()) : Date.now() };
  
  if (existingRecord && existingRecord.setsMap) {
    for (const [exIdStr, val] of Object.entries(existingRecord.setsMap)) {
      const exInPlan = exercises.find(e => String(e.id) === exIdStr);
      if (!exInPlan) continue;
      if (typeof val === 'number') {
        session.exercises[exIdStr] = { totalDoneSets: val, groups: exInPlan.intensityGroups.map(g => ({ doneSets:0, doneRepsPerSet:[], targetSets:g.sets, targetReps:g.reps, targetWeight:g.weight||0 })) };
      } else {
        session.exercises[exIdStr] = { totalDoneSets: val.totalDoneSets||0, groups: (val.groups||[]).map(g=>({ doneSets:g.doneSets||0, doneRepsPerSet:g.doneRepsPerSet||[], targetSets:g.targetSets||0, targetReps:g.targetReps||0, targetWeight:g.targetWeight||0 })) };
      }
    }
  }
  // 为计划中的新动作（不在记录中）初始化
  for (const ex of exercises) {
    const exIdStr = String(ex.id);
    if (!session.exercises[exIdStr]) {
      session.exercises[exIdStr] = { totalDoneSets:0, groups: ex.intensityGroups.map(g=>({ doneSets:0, doneRepsPerSet:[], targetSets:g.sets, targetReps:g.reps, targetWeight:g.weight||0 })) };
    }
  }
  State.activeSessions[planId] = session;
  return session;
}

// ===== 打卡 =====
async function checkIn(planId, date) {
  const plan = await DB.plans.get(planId);
  if (!plan) return;
  const session = await getOrRecoverSession(planId, date);
  const exercises = (plan.exercises || []).map(normalizeExercise);
  const completedExercises = [], setsMap = {}; let totalSets = 0;

    // 强制确保 session 包含所有动作的数据（修复新动作数据丢失问题）
  for (const ex of exercises) {
    const exIdStr = String(ex.id);
    if (!session.exercises[exIdStr]) {
      console.log('初始化新动作 session 数据:', ex.name);
      session.exercises[exIdStr] = { totalDoneSets:0, groups: ex.intensityGroups.map(g => ({ doneSets:0, doneRepsPerSet:[], targetSets:g.sets, targetReps:g.reps, targetWeight:g.weight||0 })) };
    }
  }
  
  exercises.forEach(ex => {
    const exIdStr = String(ex.id);
    const exData = session.exercises[exIdStr];
    const totalTargetSets = totalSetsForExercise(ex);
    if (exData) {
      const doneSets = exData.totalDoneSets || 0; totalSets += doneSets;
      setsMap[exIdStr] = { totalDoneSets: doneSets, exName: ex.name, weight: ex.intensityGroups[0].weight||0, targetSets: totalTargetSets, targetReps: ex.intensityGroups[0].reps,
        groups: (exData.groups||[]).map((g, gi) => ({ doneSets:g.doneSets||0, doneRepsPerSet:g.doneRepsPerSet||[], targetSets:g.targetSets||ex.intensityGroups[gi].sets, targetReps:g.targetReps||ex.intensityGroups[gi].reps, targetWeight:g.targetWeight||ex.intensityGroups[gi].weight||0 }))
      };
      if (doneSets >= totalTargetSets) completedExercises.push(ex.id);
    } else {
      setsMap[exIdStr] = { totalDoneSets: 0, exName:ex.name, weight:ex.intensityGroups[0].weight||0, targetSets:totalTargetSets, targetReps:ex.intensityGroups[0].reps,
        groups: ex.intensityGroups.map(g=>({ doneSets:0, doneRepsPerSet:[], targetSets:g.sets, targetReps:g.reps, targetWeight:g.weight||0 }))
      };
    }
  });

  const allCompleted = completedExercises.length === exercises.length && exercises.length > 0;

  const existingRecords = await DB.records.getByDate(date);
  const existingRecord = existingRecords.find(r => r.planId === planId);
  const recordData = { planId, planName:plan.name, date, completedExercises, setsMap, completedSets:totalSets, completed:allCompleted,
    duration:Math.round((Date.now()-(session.startTime||Date.now()))/60000), timestamp:Date.now() };

  if (existingRecord) { await DB.records.update({...existingRecord,...recordData}); }
  else { await DB.records.add(recordData); }

  const allRecs = await DB.records.getByDate(date);
  const allDayPlans = await DB.plans.getByDate(date);
  const allPlansDone = allDayPlans.every(p => { const r=allRecs.find(rec=>rec.planId===p.id); return r&&r.completed; });

  await DB.checkins.put({ date, completed:allPlansDone, planCount:allDayPlans.length, completedPlanCount:allRecs.filter(r=>r.completed).length,
    totalSets:allRecs.reduce((s,r)=>s+(r.completedSets||0),0), timestamp:Date.now() });

  // 打卡完成后自动保存到文件
  if (FileSync._dirHandle) {
    await FileSync.saveToFile();
  }

  State.currentExerciseView = null;
  showToast(allCompleted ? '🎉 训练完成！已打卡' : '📝 记录已保存');
  await renderToday();
}
