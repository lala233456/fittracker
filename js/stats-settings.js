// ===== 统计页面（v3 - 支持多强度分组） =====
async function renderStats() {
  const main = document.getElementById('appMain');
  const tab = State.statsTab;

  let html = `<div class="page-enter">
    <div class="stats-tabs">
      <button class="stats-tab ${tab==='week'?'active':''}" onclick="switchStatsTab('week')">本周</button>
      <button class="stats-tab ${tab==='month'?'active':''}" onclick="switchStatsTab('month')">本月</button>
      <button class="stats-tab ${tab==='year'?'active':''}" onclick="switchStatsTab('year')">全年</button>
    </div>
    <div id="statsBody"></div>
  </div>`;
  main.innerHTML = html;
  await loadStatsBody(tab);
}

async function switchStatsTab(tab) {
  State.statsTab = tab;
  document.querySelectorAll('.stats-tab').forEach(t => {
    const map = {week:'本周',month:'本月',year:'全年'};
    t.classList.toggle('active', t.textContent === map[tab]);
  });
  await loadStatsBody(tab);
}

async function loadStatsBody(tab) {
  const container = document.getElementById('statsBody');
  if (!container) return;

  const today = Utils.today();
  const allRecords = await DB.records.getAll();
  const allCheckins = await DB.checkins.getAll();
  const allPlans = await DB.plans.getAll();

  let startDate, endDate = today;
  const now = new Date();

  if (tab === 'week') {
    const dayOfWeek = now.getDay();
    const start = new Date(now);
    start.setDate(now.getDate() - dayOfWeek);
    startDate = `${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,'0')}-${String(start.getDate()).padStart(2,'0')}`;
  } else if (tab === 'month') {
    startDate = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
  } else {
    startDate = `${now.getFullYear()}-01-01`;
  }

  const filteredRecords = allRecords.filter(r => r.date >= startDate && r.date <= endDate);
  const filteredCheckins = allCheckins.filter(c => c.date >= startDate && c.date <= endDate);

  const completedDays = filteredCheckins.filter(c => c.completed).length;
  const totalSets = filteredRecords.reduce((s, r) => s + (r.completedSets || 0), 0);
  const totalPlans = filteredRecords.filter(r => r.completed).length;

  // 最长连击
  let maxStreak = 0, curStreak = 0;
  const sortedCheckins = [...allCheckins].sort((a,b)=>a.date.localeCompare(b.date));
  let prevDate = null;
  for (const c of sortedCheckins) {
    if (c.completed) {
      if (prevDate) {
        const prev = new Date(prevDate);
        const cur = new Date(c.date);
        const diff = (cur - prev) / 86400000;
        if (diff === 1) curStreak++;
        else curStreak = 1;
      } else curStreak = 1;
      maxStreak = Math.max(maxStreak, curStreak);
      prevDate = c.date;
    } else { curStreak = 0; prevDate = null; }
  }

  // ===== 按动作分类统计（支持多强度分组） =====
  const exerciseStats = {};
  for (const r of filteredRecords) {
    const plan = allPlans.find(p => p.id === r.planId);
    const setsMap = r.setsMap || {};
    for (const [exIdStr, val] of Object.entries(setsMap)) {
      const ex = plan ? normalizeExercise(plan.exercises.find(e => String(e.id) === exIdStr)) : null;
      const exName = val.exName || (ex ? ex.name : '未知动作');

      let totalDoneSets, totalDoneReps, groupsInfo;
      if (typeof val === 'number') {
        totalDoneSets = val;
        totalDoneReps = val * (val.reps || (ex ? ex.intensityGroups[0].reps : 10));
        groupsInfo = ex ? ex.intensityGroups.map(g => ({ doneSets: 0, targetSets: g.sets, targetReps: g.reps, targetWeight: g.weight })) : [];
      } else {
        totalDoneSets = val.totalDoneSets || val.doneSets || 0;
        // 计算总次数：从 groups 汇总
        if (val.groups && val.groups.length > 0) {
          totalDoneReps = val.groups.reduce((s, g) =>
            s + (g.doneRepsPerSet ? g.doneRepsPerSet.reduce((a,b)=>a+b,0) : g.doneSets * (g.targetReps || 10)), 0);
          groupsInfo = val.groups;
        } else {
          totalDoneReps = totalDoneSets * (val.reps || val.targetReps || (ex ? ex.intensityGroups[0].reps : 10));
          groupsInfo = [];
        }
      }

      if (!exerciseStats[exName]) {
        exerciseStats[exName] = { totalSets: 0, totalReps: 0, sessions: 0, maxWeight: 0, groupsInfo: [], ex };
      }
      exerciseStats[exName].totalSets += totalDoneSets;
      exerciseStats[exName].totalReps += totalDoneReps;
      exerciseStats[exName].sessions++;
      // 记录最高重量
      if (ex) {
        const maxW = Math.max(...ex.intensityGroups.map(g => g.weight || 0));
        exerciseStats[exName].maxWeight = Math.max(exerciseStats[exName].maxWeight, maxW);
      }
      // 合并分组信息
      if (groupsInfo.length > 0) {
        exerciseStats[exName].groupsInfo = groupsInfo;
      }
    }
  }

  const sortedExercises = Object.entries(exerciseStats)
    .sort((a, b) => b[1].totalSets - a[1].totalSets);
  const maxExSets = Math.max(...sortedExercises.map(([,s])=>s.totalSets), 1);

  const exerciseListHtml = sortedExercises.length > 0
    ? sortedExercises.map(([name, stats]) => {
        // 多强度分组信息
        let groupsDetail = '';
        if (stats.ex && stats.ex.intensityGroups.length > 1) {
          groupsDetail = `<div class="ex-stat-groups">${stats.ex.intensityGroups.map(g =>
            `${g.sets}×${g.reps}${g.weight ? '/' + g.weight + 'kg' : ''}`
          ).join(' · ')}</div>`;
        }
        return `
          <div class="exercise-stat-row">
            <div style="min-width:80px">
              <div class="exercise-stat-name">${name}</div>
              ${groupsDetail}
            </div>
            <div class="exercise-stat-bars">
              <div class="exercise-stat-bar" style="width:${Math.min(100, Math.round(stats.totalSets / maxExSets * 100))}%"></div>
            </div>
            <div class="exercise-stat-nums">
              <span class="ex-stat-sets">${stats.totalSets}组</span>
              <span class="ex-stat-reps">${stats.totalReps}次</span>
              ${stats.maxWeight ? `<span class="ex-stat-weight">${stats.maxWeight}kg</span>` : ''}
            </div>
          </div>`;
      }).join('')
    : '<div style="font-size:13px;color:var(--text-muted);text-align:center;padding:20px">暂无动作数据</div>';

  const yearHeatmap = tab === 'year' ? `
    <div class="chart-card">
      <div class="chart-title">全年训练热力图</div>
      <div id="heatmapWrap"></div>
    </div>` : '';

  container.innerHTML = `
    <div class="stats-grid">
      <div class="stats-metric"><div class="stats-metric-value">${completedDays}</div><div class="stats-metric-label">打卡天数</div></div>
      <div class="stats-metric"><div class="stats-metric-value">${totalSets}</div><div class="stats-metric-label">完成总组数</div></div>
      <div class="stats-metric"><div class="stats-metric-value">${totalPlans}</div><div class="stats-metric-label">完成计划数</div></div>
      <div class="stats-metric"><div class="stats-metric-value">${maxStreak}</div><div class="stats-metric-label">最长连续天数</div></div>
    </div>
    <div class="chart-card">
      <div class="chart-title">训练动作统计</div>
      <div class="exercise-stats-list">${exerciseListHtml}</div>
    </div>
    <div class="chart-card">
      <div class="chart-title">各动作组数占比</div>
      <div class="chart-wrap"><canvas id="exercisePieChart"></canvas></div>
    </div>
    <div class="chart-card">
      <div class="chart-title">训练频率</div>
      <div class="chart-wrap"><canvas id="statsChart"></canvas></div>
    </div>
    <div class="chart-card">
      <div class="chart-title">完成组数趋势</div>
      <div class="chart-wrap"><canvas id="setsChart"></canvas></div>
    </div>
    ${yearHeatmap}`;

  setTimeout(() => {
    if (tab === 'week') renderWeekCharts(filteredRecords, filteredCheckins, startDate);
    else if (tab === 'month') renderMonthCharts(filteredRecords, filteredCheckins, now.getFullYear(), now.getMonth());
    else renderYearCharts(allRecords, allCheckins, now.getFullYear());
    drawExercisePieChart(sortedExercises);
  }, 50);
}

function drawExercisePieChart(sortedExercises) {
  const canvas = document.getElementById('exercisePieChart');
  if (!canvas || sortedExercises.length === 0) return;
  if (canvas._chartInstance) canvas._chartInstance.destroy();

  const labels = sortedExercises.map(([name]) => name);
  const data = sortedExercises.map(([, stats]) => stats.totalSets);
  const colors = [
    'rgba(99,102,241,0.8)', 'rgba(168,85,247,0.8)', 'rgba(34,197,94,0.8)',
    'rgba(245,158,11,0.8)', 'rgba(239,68,68,0.8)', 'rgba(14,165,233,0.8)',
    'rgba(236,72,153,0.8)', 'rgba(20,184,166,0.8)', 'rgba(251,146,60,0.8)',
    'rgba(132,204,22,0.8)'
  ];

  canvas._chartInstance = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors.slice(0, data.length),
        borderWidth: 2,
        borderColor: isDark() ? '#1e293b' : '#ffffff'
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { color: isDark() ? '#94a3b8' : '#64748b', font: { size: 11 }, boxWidth: 12, padding: 8 }
        }
      },
      cutout: '55%'
    }
  });
}

function renderWeekCharts(records, checkins, startDate) {
  const labels = [], trainingData = [], setsData = [];
  const dayNames = ['周日','周一','周二','周三','周四','周五','周六'];
  for (let i = 0; i < 7; i++) {
    const date = Utils.dateAdd(startDate, i);
    const d = new Date(date);
    labels.push(dayNames[d.getDay()]);
    const dayRecs = records.filter(r => r.date === date);
    trainingData.push(dayRecs.filter(r => r.completed).length);
    setsData.push(dayRecs.reduce((s,r) => s+(r.completedSets||0), 0));
  }
  drawBarChart('statsChart', labels, trainingData, '完成计划数');
  drawLineChart('setsChart', labels, setsData, '完成组数');
}

function renderMonthCharts(records, checkins, year, month) {
  const daysInMonth = Utils.getMonthDays(year, month);
  const labels = [], trainingData = [], setsData = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const mo = String(month+1).padStart(2,'0');
    const dd = String(d).padStart(2,'0');
    const date = `${year}-${mo}-${dd}`;
    labels.push(d === 1 || d % 5 === 0 ? d + '日' : '');
    const dayRecs = records.filter(r => r.date === date);
    trainingData.push(dayRecs.filter(r => r.completed).length);
    setsData.push(dayRecs.reduce((s,r) => s+(r.completedSets||0), 0));
  }
  drawBarChart('statsChart', labels, trainingData, '完成计划数');
  drawLineChart('setsChart', labels, setsData, '完成组数');
}

function renderYearCharts(records, checkins, year) {
  const months = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
  const trainingData = new Array(12).fill(0);
  const setsData = new Array(12).fill(0);
  const yrStr = String(year);
  records.filter(r => r.date.startsWith(yrStr)).forEach(r => {
    const m = parseInt(r.date.split('-')[1]) - 1;
    if (r.completed) trainingData[m]++;
    setsData[m] += (r.completedSets || 0);
  });
  drawBarChart('statsChart', months, trainingData, '完成计划数');
  drawLineChart('setsChart', months, setsData, '完成组数');
  renderHeatmap(checkins, year);
}

function renderHeatmap(checkins, year) {
  const wrap = document.getElementById('heatmapWrap');
  if (!wrap) return;
  const checkinMap = new Map(checkins.map(c => [c.date, c]));
  const yrStr = String(year);
  const start = new Date(yrStr + '-01-01');
  const end = new Date(yrStr + '-12-31');
  const maxSets = Math.max(...checkins.map(c => c.totalSets || 0), 1);
  let cells = '';
  const curr = new Date(start);
  for (let i = 0; i < curr.getDay(); i++) cells += '<div class="heatmap-cell"></div>';
  while (curr <= end) {
    const cy = curr.getFullYear();
    const cm = String(curr.getMonth()+1).padStart(2,'0');
    const cd = String(curr.getDate()).padStart(2,'0');
    const dateStr = `${cy}-${cm}-${cd}`;
    const ci = checkinMap.get(dateStr);
    let level = 0;
    if (ci) {
      const ratio = (ci.totalSets || 0) / maxSets;
      level = ratio > 0.75 ? 4 : ratio > 0.5 ? 3 : ratio > 0.25 ? 2 : 1;
    }
    cells += `<div class="heatmap-cell" data-level="${level}" title="${dateStr}"></div>`;
    curr.setDate(curr.getDate() + 1);
  }
  wrap.innerHTML = `<div class="heatmap-wrap">${cells}</div>
    <div style="display:flex;align-items:center;gap:4px;margin-top:8px;font-size:11px;color:var(--text-muted)">
      <span>少</span>
      <div class="heatmap-cell" data-level="0" style="width:12px;height:12px;border-radius:2px;display:inline-block"></div>
      <div class="heatmap-cell" data-level="1" style="width:12px;height:12px;border-radius:2px;display:inline-block"></div>
      <div class="heatmap-cell" data-level="2" style="width:12px;height:12px;border-radius:2px;display:inline-block"></div>
      <div class="heatmap-cell" data-level="3" style="width:12px;height:12px;border-radius:2px;display:inline-block"></div>
      <div class="heatmap-cell" data-level="4" style="width:12px;height:12px;border-radius:2px;display:inline-block"></div>
      <span>多</span>
    </div>`;
}

const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark';

function drawBarChart(canvasId, labels, data, label) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  if (canvas._chartInstance) canvas._chartInstance.destroy();
  canvas._chartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label, data, backgroundColor: 'rgba(99,102,241,0.7)', borderRadius: 6, borderSkipped: false }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, grid: { color: isDark() ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }, ticks: { color: isDark() ? '#94a3b8' : '#64748b', stepSize: 1 } },
        x: { grid: { display: false }, ticks: { color: isDark() ? '#94a3b8' : '#64748b', maxRotation: 0 } }
      }
    }
  });
}

function drawLineChart(canvasId, labels, data, label) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  if (canvas._chartInstance) canvas._chartInstance.destroy();
  canvas._chartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{ label, data, borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.1)', fill: true, tension: 0.4, pointRadius: 3, pointBackgroundColor: '#6366f1' }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, grid: { color: isDark() ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }, ticks: { color: isDark() ? '#94a3b8' : '#64748b' } },
        x: { grid: { display: false }, ticks: { color: isDark() ? '#94a3b8' : '#64748b', maxRotation: 0 } }
      }
    }
  });
}

// ===== 设置页面 =====
async function renderSettings() {
  const main = document.getElementById('appMain');
  const theme = State.theme;
  main.innerHTML = `<div class="page-enter">
    <div class="settings-section">
      <div class="settings-section-title">外观</div>
      <div class="settings-list">
        <div class="settings-item">
          <div class="settings-icon" style="background:rgba(99,102,241,0.1)">🌙</div>
          <div class="settings-info">
            <div class="settings-label">深色模式</div>
            <div class="settings-desc">切换界面主题</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="darkModeToggle" ${theme === 'dark' ? 'checked' : ''} onchange="toggleDarkMode(this.checked)">
            <span class="toggle-track"></span>
          </label>
        </div>
      </div>
    </div>
    <div class="settings-section">
      <div class="settings-section-title">数据管理</div>
      <div class="settings-list">
        <div class="settings-item" onclick="exportData()">
          <div class="settings-icon" style="background:rgba(34,197,94,0.1)">📤</div>
          <div class="settings-info"><div class="settings-label">导出数据备份</div><div class="settings-desc">将所有训练数据导出为 JSON 文件</div></div>
          <span class="settings-arrow">›</span>
        </div>
        <div class="settings-item" onclick="document.getElementById('importFile').click()">
          <div class="settings-icon" style="background:rgba(245,158,11,0.1)">📥</div>
          <div class="settings-info"><div class="settings-label">导入数据备份</div><div class="settings-desc">从 JSON 备份文件恢复数据</div></div>
          <span class="settings-arrow">›</span>
        </div>
        <input type="file" id="importFile" accept=".json" style="display:none" onchange="importData(event)">
        <div class="settings-item" onclick="clearAllData()">
          <div class="settings-icon" style="background:rgba(239,68,68,0.1)">🗑️</div>
          <div class="settings-info"><div class="settings-label">清除所有数据</div><div class="settings-desc">删除全部训练记录和计划（不可恢复）</div></div>
          <span class="settings-arrow">›</span>
        </div>
      </div>
    </div>
    <div class="settings-section">
      <div class="settings-section-title">关于</div>
      <div class="settings-list">
        <div class="settings-item">
          <div class="settings-icon" style="background:rgba(99,102,241,0.1)">💪</div>
          <div class="settings-info"><div class="settings-label">FitTracker</div><div class="settings-desc">版本 3.0.0 · 多强度分组版 · 本地存储，数据安全</div></div>
        </div>
      </div>
    </div>
  </div>`;
}

function toggleDarkMode(dark) { applyTheme(dark ? 'dark' : 'light'); }

async function exportData() {
  try {
    const data = await DB.exportAll();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().split('T')[0];
    a.href = url; a.download = 'fittracker-backup-' + dateStr + '.json'; a.click();
    URL.revokeObjectURL(url);
    showToast('数据已导出 ✓', 2500);
  } catch (e) { showToast('导出失败：' + e.message); }
}

async function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    Modal.show(`
      <div class="modal-drag-handle"></div>
      <div class="modal-title">导入数据</div>
      <div class="confirm-dialog">
        <div class="confirm-message">
          将导入备份文件「<strong>${file.name}</strong>」<br>
          包含 <strong>${(data.plans||[]).length}</strong> 个计划、
          <strong>${(data.records||[]).length}</strong> 条训练记录。<br><br>
          <span style="color:var(--warning)">⚠️ 导入将合并到现有数据</span>
        </div>
        <div class="confirm-actions">
          <button class="btn btn-ghost" onclick="Modal.close()">取消</button>
          <button class="btn btn-primary" onclick="confirmImport()">确认导入</button>
        </div>
      </div>`);
    window._pendingImportData = data;
  } catch (e) { showToast('文件格式错误：' + e.message); }
  event.target.value = '';
}

async function confirmImport() {
  if (!window._pendingImportData) return;
  try {
    await DB.importAll(window._pendingImportData);
    window._pendingImportData = null;
    Modal.close();
    showToast('数据导入成功 ✓', 2500);
  } catch (e) { showToast('导入失败：' + e.message); }
}

function clearAllData() {
  Modal.show(`
    <div class="modal-drag-handle"></div>
    <div class="modal-title">清除所有数据</div>
    <div class="confirm-dialog">
      <div class="confirm-message">
        <strong style="color:var(--danger)">此操作不可撤销！</strong><br><br>
        所有训练计划、训练记录和打卡记录将被永久删除。建议先导出备份。
      </div>
      <div class="confirm-actions">
        <button class="btn btn-ghost" onclick="Modal.close()">取消</button>
        <button class="btn btn-danger" onclick="confirmClearAll()">确认清除</button>
      </div>
    </div>`);
}

async function confirmClearAll() {
  await DB.clearAll();
  Modal.close();
  showToast('数据已清除');
  State.activeSessions = {};
  State.currentExerciseView = null;
  await renderSettings();
}

// ===== 初始化应用 =====
async function initApp() {
  try {
    await DB.init();
    State._plans = await DB.plans.getAll();
    await renderPage('today');
  } catch (e) {
    console.error('App init error:', e);
    document.getElementById('appMain').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">❌</div>
        <div class="empty-title">初始化失败</div>
        <div class="empty-desc">${e.message}</div>
      </div>`;
  }
}

initApp();
