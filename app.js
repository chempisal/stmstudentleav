// Core App State
let state = {
  records: JSON.parse(localStorage.getItem('truancy_records')) || [],
  scriptUrl: localStorage.getItem('google_sheet_script_url') || '',
  isSyncing: false,
  editingRecordId: null
};

// UI Elements References
const elements = {
  form: document.getElementById('truancyForm'),
  studentName: document.getElementById('studentName'),
  className: document.getElementById('className'),
  subjectName: document.getElementById('subjectName'),
  periodHour: document.getElementById('periodHour'),
  truancyType: document.getElementById('truancyType'),
  reason: document.getElementById('reason'),
  reporterTeacher: document.getElementById('reporterTeacher'),
  
  scriptUrlInput: document.getElementById('scriptUrl'),
  btnSaveConfig: document.getElementById('btnSaveConfig'),
  btnCopyCode: document.getElementById('btnCopyCode'),
  
  totalRecords: document.getElementById('totalRecords'),
  topTruantClass: document.getElementById('topTruantClass'),
  topTruantPeriod: document.getElementById('topTruantPeriod'),
  pendingSyncCount: document.getElementById('pendingSyncCount'),
  
  classChartContainer: document.getElementById('classChartContainer'),
  typeChartContainer: document.getElementById('typeChartContainer'),
  
  tableSearch: document.getElementById('tableSearch'),
  recordsTableBody: document.getElementById('recordsTableBody'),
  btnExportCSV: document.getElementById('btnExportCSV'),
  btnForceSync: document.getElementById('btnForceSync'),
  btnPrint: document.getElementById('btnPrint'),
  btnSubmitText: document.querySelector('#truancyForm button[type="submit"] span'),
  
  syncStatusDot: document.getElementById('syncStatusDot'),
  syncStatusText: document.getElementById('syncStatusText'),
  toastMessage: document.getElementById('toastMessage'),
  toastIcon: document.getElementById('toastIcon'),
  toastText: document.getElementById('toastText')
};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
  // Populate settings fields from state
  if (state.scriptUrl) {
    elements.scriptUrlInput.value = state.scriptUrl;
  }
  
  // Set up event listeners
  elements.form.addEventListener('submit', handleFormSubmit);
  elements.btnSaveConfig.addEventListener('click', saveConfig);
  elements.btnCopyCode.addEventListener('click', copyAppsScriptCode);
  elements.btnExportCSV.addEventListener('click', exportToCSV);
  elements.btnForceSync.addEventListener('click', forceSyncAll);
  elements.btnPrint.addEventListener('click', () => window.print());
  elements.tableSearch.addEventListener('input', renderUI);
  
  // Initial render & sync attempt
  renderUI();
  updateSyncStatusHeader();
  
  if (state.scriptUrl) {
    autoSyncPending();
  }
});

// --- UI TOAST NOTIFICATION ---
function showToast(message, isSuccess = true) {
  elements.toastIcon.textContent = isSuccess ? '✨' : '⚠️';
  elements.toastText.textContent = message;
  
  elements.toastMessage.classList.add('show');
  setTimeout(() => {
    elements.toastMessage.classList.remove('show');
  }, 2500);
}

// --- CONFIGURATION & UTILITIES ---
function saveConfig() {
  const url = elements.scriptUrlInput.value.trim();
  if (url && !url.startsWith('https://script.google.com/')) {
    showToast('URL Google Web App មិនត្រឹមត្រូវឡើយ!', false);
    return;
  }
  
  state.scriptUrl = url;
  localStorage.setItem('google_sheet_script_url', url);
  showToast('រក្សាទុកការកំណត់បានជោគជ័យ!');
  updateSyncStatusHeader();
  
  if (url) {
    autoSyncPending();
  }
}

function updateSyncStatusHeader() {
  if (!state.scriptUrl) {
    elements.syncStatusDot.className = 'status-dot';
    elements.syncStatusText.textContent = 'មិនទាន់ភ្ជាប់ Google Sheets';
    return;
  }
  
  const pendingCount = state.records.filter(r => !r.synced).length;
  if (pendingCount > 0) {
    elements.syncStatusDot.className = 'status-dot pending';
    elements.syncStatusText.textContent = `មានទិន្នន័យ ${pendingCount} មិនទាន់ស៊ីង`;
  } else {
    elements.syncStatusDot.className = 'status-dot synced';
    elements.syncStatusText.textContent = 'បានស៊ីងរួចរាល់ជាមួយ Google Sheets';
  }
}

function copyAppsScriptCode() {
  const code = document.getElementById('codeSnippet').textContent;
  navigator.clipboard.writeText(code).then(() => {
    showToast('ចម្លងកូដគំរូបានជោគជ័យ!');
  }).catch(() => {
    showToast('ការចម្លងបរាជ័យ!', false);
  });
}

// --- LOCAL DATABASE STORAGE ---
function saveRecordsToStorage() {
  localStorage.setItem('truancy_records', JSON.stringify(state.records));
}

// --- FORM HANDLING & LOGGING ---
async function handleFormSubmit(e) {
  e.preventDefault();
  
  if (state.editingRecordId) {
    // Update existing record
    const index = state.records.findIndex(r => r.id === state.editingRecordId);
    if (index !== -1) {
      state.records[index].studentName = elements.studentName.value.trim();
      state.records[index].className = elements.className.value;
      state.records[index].subjectName = elements.subjectName.value.trim();
      state.records[index].periodHour = elements.periodHour.value;
      state.records[index].truancyType = elements.truancyType.value;
      state.records[index].reason = elements.reason.value.trim() || 'គ្មានការកត់ត្រា';
      state.records[index].reporterTeacher = elements.reporterTeacher.value.trim();
      state.records[index].synced = false; // Re-sync required after edit
      
      saveRecordsToStorage();
      
      const editedId = state.editingRecordId;
      state.editingRecordId = null;
      elements.btnSubmitText.textContent = '➕ រក្សាទុកទិន្នន័យ (Save Record)';
      
      // Clear inputs
      elements.studentName.value = '';
      elements.subjectName.value = '';
      elements.reason.value = '';
      
      renderUI();
      showToast('បានកែសម្រួលទិន្នន័យសិស្សរួចរាល់!');
      
      if (state.scriptUrl) {
        syncSingleRecord(editedId);
      }
    }
  } else {
    // Create new record
    const newRecord = {
      id: 'TR_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      timestamp: new Date().toISOString(),
      studentName: elements.studentName.value.trim(),
      className: elements.className.value,
      subjectName: elements.subjectName.value.trim(),
      periodHour: elements.periodHour.value,
      truancyType: elements.truancyType.value,
      reason: elements.reason.value.trim() || 'គ្មានការកត់ត្រា',
      reporterTeacher: elements.reporterTeacher.value.trim(),
      synced: false
    };
    
    state.records.unshift(newRecord);
    saveRecordsToStorage();
    
    elements.studentName.value = '';
    elements.subjectName.value = '';
    elements.reason.value = '';
    
    renderUI();
    showToast('បានកត់ត្រាទិន្នន័យសិស្សរួចរាល់!');
    
    if (state.scriptUrl) {
      syncSingleRecord(newRecord.id);
    }
  }
}

// --- DATABASE DELETE OPERATION ---
function deleteRecord(id) {
  if (confirm('តើអ្នកពិតជាចង់លុបការកត់ត្រានេះមែនទេ?')) {
    state.records = state.records.filter(r => r.id !== id);
    saveRecordsToStorage();
    renderUI();
    showToast('លុបការកត់ត្រារួចរាល់!');
    updateSyncStatusHeader();
  }
}

// --- GOOGLE SHEETS SYNC SYSTEM ---
async function syncSingleRecord(id) {
  const index = state.records.findIndex(r => r.id === id);
  if (index === -1 || state.records[index].synced || !state.scriptUrl) return;
  
  const record = state.records[index];
  
  try {
    const response = await fetch(state.scriptUrl, {
      method: 'POST',
      mode: 'no-cors', // standard workaround for Google App Script Web App redirects
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(record)
    });
    
    // With 'no-cors', we won't get body details, but we assume success if no exception thrown
    state.records[index].synced = true;
    saveRecordsToStorage();
    renderUI();
    updateSyncStatusHeader();
  } catch (error) {
    console.error('Sync failed:', error);
  }
}

async function autoSyncPending() {
  if (state.isSyncing || !state.scriptUrl) return;
  
  const pending = state.records.filter(r => !r.synced);
  if (pending.length === 0) return;
  
  state.isSyncing = true;
  
  for (const record of pending) {
    await syncSingleRecord(record.id);
  }
  
  state.isSyncing = false;
}

async function forceSyncAll() {
  if (!state.scriptUrl) {
    showToast('សូមបញ្ចូល Web App URL ជាមុនសិន!', false);
    return;
  }
  
  const pending = state.records.filter(r => !r.synced);
  if (pending.length === 0) {
    showToast('គ្មានទិន្នន័យចាំបាច់ត្រូវស៊ីងទេ!');
    return;
  }
  
  showToast('កំពុងស៊ីងទិន្នន័យទៅកាន់ Google Sheets...');
  elements.btnForceSync.disabled = true;
  
  await autoSyncPending();
  
  elements.btnForceSync.disabled = false;
  
  const remaining = state.records.filter(r => !r.synced).length;
  if (remaining === 0) {
    showToast('ស៊ីងទិន្នន័យទាំងអស់បានជោគជ័យ!');
  } else {
    showToast(`ស៊ីងបានខ្លះ, នៅសល់ ${remaining} ករណីបរាជ័យ`, false);
  }
}

// --- ANALYTICS & UI RENDERING ---
function renderUI() {
  const searchQuery = elements.tableSearch.value.toLowerCase().trim();
  
  // 1. Render Stats Overview
  elements.totalRecords.textContent = state.records.length;
  
  // Calculate Class & Period Frequencies
  const classFreq = {};
  const periodFreq = {};
  const typeFreq = {};
  let pendingCount = 0;
  
  state.records.forEach(r => {
    if (!r.synced) pendingCount++;
    
    classFreq[r.className] = (classFreq[r.className] || 0) + 1;
    periodFreq[r.periodHour] = (periodFreq[r.periodHour] || 0) + 1;
    typeFreq[r.truancyType] = (typeFreq[r.truancyType] || 0) + 1;
  });
  
  elements.pendingSyncCount.textContent = pendingCount;
  
  // Find top class
  let topClass = 'N/A';
  let maxClassCount = 0;
  for (const [cls, val] of Object.entries(classFreq)) {
    if (val > maxClassCount) {
      maxClassCount = val;
      topClass = cls + ` (${val} ដង)`;
    }
  }
  elements.topTruantClass.textContent = topClass;

  // Find peak hour
  let topPeriod = 'N/A';
  let maxPeriodCount = 0;
  for (const [prd, val] of Object.entries(periodFreq)) {
    const shortPeriod = prd.split(' (')[0];
    if (val > maxPeriodCount) {
      maxPeriodCount = val;
      topPeriod = shortPeriod + ` (${val} ដង)`;
    }
  }
  elements.topTruantPeriod.textContent = topPeriod;

  // 2. Render Charts
  renderClassChart(classFreq);
  renderTypeChart(typeFreq);

  // 3. Render Table
  elements.recordsTableBody.innerHTML = '';
  
  const filtered = state.records.filter(r => {
    return r.studentName.toLowerCase().includes(searchQuery) || 
           r.className.toLowerCase().includes(searchQuery) ||
           r.subjectName.toLowerCase().includes(searchQuery) ||
           r.reporterTeacher.toLowerCase().includes(searchQuery);
  });
  
  if (filtered.length === 0) {
    elements.recordsTableBody.innerHTML = `
      <tr>
        <td colspan="9">
          <div class="empty-placeholder">
            <span class="empty-icon">📂</span>
            <span>មិនមានទិន្នន័យត្រូវបង្ហាញឡើយ</span>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  filtered.forEach(r => {
    const tr = document.createElement('tr');
    
    // Formatted date string
    const dateObj = new Date(r.timestamp);
    const dateStr = dateObj.toLocaleDateString('km-KH') + ' ' + dateObj.toLocaleTimeString('km-KH', { hour: '2-digit', minute: '2-digit' });
    
    // Type badge class
    let badgeClass = 'badge-warning';
    if (r.truancyType.includes('Absent') || r.truancyType.includes('គ្មានច្បាប់')) {
      badgeClass = 'badge-danger';
    }
    
    // Sync indicator label
    const syncPill = r.synced 
      ? '<span style="color: var(--success); font-size: 0.75rem;">✓ Synced</span>' 
      : '<span style="color: var(--primary); font-size: 0.75rem;">⏳ Pending</span>';
      
    tr.innerHTML = `
      <td style="font-size: 0.75rem; color: var(--text-muted);">${dateStr}</td>
      <td style="font-weight: 700;">${r.studentName}</td>
      <td><span class="badge" style="background: rgba(255,255,255,0.05); color: #fff;">${r.className}</span></td>
      <td>${r.subjectName}</td>
      <td>${r.periodHour.split(' (')[0]}</td>
      <td><span class="badge ${badgeClass}">${r.truancyType.split(' (')[0]}</span></td>
      <td style="max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${r.reason}">${r.reason}</td>
      <td style="font-size: 0.8rem; color: var(--text-muted);">${r.reporterTeacher}</td>
      <td>
        <div style="display: flex; align-items: center; gap: 10px;">
          ${syncPill}
          <button class="btn-edit" data-id="${r.id}" title="កែសម្រួល">✏️</button>
          <button class="btn-delete" data-id="${r.id}" title="លុបការកត់ត្រា">🗑️</button>
        </div>
      </td>
    `;
    
    // Wire up edit listener
    tr.querySelector('.btn-edit').addEventListener('click', (e) => {
      e.stopPropagation();
      startEditRecord(r.id);
    });
    
    // Wire up delete listener
    tr.querySelector('.btn-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteRecord(r.id);
    });
    
    elements.recordsTableBody.appendChild(tr);
  });
  
  updateSyncStatusHeader();
}

function renderClassChart(classFreq) {
  elements.classChartContainer.innerHTML = '';
  
  const entries = Object.entries(classFreq);
  if (entries.length === 0) {
    elements.classChartContainer.innerHTML = '<div class="empty-placeholder" style="padding: 10px;">គ្មានទិន្នន័យវិភាគ</div>';
    return;
  }
  
  // Find max value for percentages
  const max = Math.max(...entries.map(e => e[1]));
  
  // Sort classes by counts descending
  entries.sort((a, b) => b[1] - a[1]);
  
  entries.slice(0, 5).forEach(([cls, count]) => {
    const percentage = max > 0 ? (count / max) * 100 : 0;
    
    const row = document.createElement('div');
    row.className = 'chart-bar-row';
    row.innerHTML = `
      <div class="chart-bar-info">
        <span>ថ្នាក់ទី ${cls}</span>
        <span>${count} ករណី</span>
      </div>
      <div class="chart-bar-wrapper">
        <div class="chart-bar-fill" style="width: ${percentage}%"></div>
      </div>
    `;
    elements.classChartContainer.appendChild(row);
  });
}

function renderTypeChart(typeFreq) {
  elements.typeChartContainer.innerHTML = '';
  
  const entries = Object.entries(typeFreq);
  if (entries.length === 0) {
    elements.typeChartContainer.innerHTML = '<div class="empty-placeholder" style="padding: 10px;">គ្មានទិន្នន័យវិភាគ</div>';
    return;
  }
  
  const max = Math.max(...entries.map(e => e[1]));
  
  entries.forEach(([type, count]) => {
    const percentage = max > 0 ? (count / max) * 100 : 0;
    const cleanType = type.split(' (')[0];
    
    const row = document.createElement('div');
    row.className = 'chart-bar-row';
    row.innerHTML = `
      <div class="chart-bar-info">
        <span>${cleanType}</span>
        <span>${count} ករណី</span>
      </div>
      <div class="chart-bar-wrapper">
        <div class="chart-bar-fill" style="width: ${percentage}%; background: linear-gradient(90deg, #00b4d8, #0077b6); box-shadow: 0 0 8px var(--secondary-glow);"></div>
      </div>
    `;
    elements.typeChartContainer.appendChild(row);
  });
}

// --- CSV DATA EXPORT ---
function exportToCSV() {
  if (state.records.length === 0) {
    showToast('គ្មានទិន្នន័យដើម្បីនាំចេញឡើយ!', false);
    return;
  }
  
  let csvContent = '\uFEFF'; // UTF-8 BOM for Excel Khmer text compatibility
  csvContent += 'កាលបរិច្ឆេទ,ឈ្មោះសិស្ស,ថ្នាក់រៀន,មុខវិជ្ជា,ម៉ោង,ប្រភេទអវត្តមាន,មូលហេតុ,គ្រូរាយការណ៍,ស្ថានភាពស៊ីង\n';
  
  state.records.forEach(r => {
    const dateObj = new Date(r.timestamp);
    const dateStr = dateObj.toLocaleDateString('km-KH') + ' ' + dateObj.toLocaleTimeString('km-KH', { hour: '2-digit', minute: '2-digit' });
    
    const row = [
      `"${dateStr}"`,
      `"${r.studentName.replace(/"/g, '""')}"`,
      `"${r.className}"`,
      `"${r.subjectName.replace(/"/g, '""')}"`,
      `"${r.periodHour.split(' (')[0]}"`,
      `"${r.truancyType.split(' (')[0]}"`,
      `"${r.reason.replace(/"/g, '""')}"`,
      `"${r.reporterTeacher.replace(/"/g, '""')}"`,
      `"${r.synced ? 'ស៊ីងរួច' : 'មិនទាន់ស៊ីង'}"`
    ];
    csvContent += row.join(',') + '\n';
  });
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `truancy_report_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  showToast('នាំចេញឯកសារ CSV រួចរាល់!');
}

function startEditRecord(id) {
  const record = state.records.find(r => r.id === id);
  if (!record) return;
  
  elements.studentName.value = record.studentName;
  elements.className.value = record.className;
  elements.subjectName.value = record.subjectName;
  elements.periodHour.value = record.periodHour;
  elements.truancyType.value = record.truancyType;
  elements.reason.value = record.reason === 'គ្មានការកត់ត្រា' ? '' : record.reason;
  elements.reporterTeacher.value = record.reporterTeacher;
  
  state.editingRecordId = record.id;
  elements.btnSubmitText.textContent = '💾 កែសម្រួលទិន្នន័យ (Update Record)';
  
  elements.form.scrollIntoView({ behavior: 'smooth' });
  elements.studentName.focus();
}
