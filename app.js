// ===== STATE =====
let state = {
  tasks: [], events: [],
  userId: null, userEmail: null,
  currentView: 'tasks',
  calYear: new Date().getFullYear(), calMonth: new Date().getMonth(),
  selectedDay: null, agendaFilter: 'today',
  editingId: null, defaultStatus: 'todo',
  deleteId: null, deleteKind: null,
  authMode: 'login'
};

// ===== RETRY HELPER =====
async function withRetry(fn, retries = 2, delayMs = 800) {
  for (let i = 0; i <= retries; i++) {
    try { return await fn(); }
    catch (err) {
      if (i === retries) throw err;
      await new Promise(r => setTimeout(r, delayMs * (i + 1)));
    }
  }
}

// ===== SUPABASE DB LAYER =====
const db = {
  async loadTasks() {
    return withRetry(async () => {
      const { data, error } = await _supabase.from('tasks').select('*').order('created_at');
      if (error) throw error;
      return data.map(rowToTask);
    });
  },
  async createTask(task) {
    return withRetry(() => _supabase.from('tasks').insert(taskToRow(task)).then(({error}) => { if(error) throw error; }));
  },
  async updateTask(id, changes) {
    const row = {};
    if (changes.title !== undefined)    row.title       = changes.title;
    if (changes.desc !== undefined)     row.description = changes.desc;
    if (changes.priority !== undefined) row.priority    = changes.priority;
    if (changes.status !== undefined)   row.status      = changes.status;
    if (changes.due !== undefined)      row.due_date    = changes.due || null;
    return withRetry(() => _supabase.from('tasks').update(row).eq('id', id).then(({error}) => { if(error) throw error; }));
  },
  async deleteTask(id) {
    return withRetry(() => _supabase.from('tasks').delete().eq('id', id).then(({error}) => { if(error) throw error; }));
  },
  async loadEvents() {
    return withRetry(async () => {
      const { data, error } = await _supabase.from('events').select('*').order('event_date');
      if (error) throw error;
      return data.map(rowToEvent);
    });
  },
  async createEvent(ev) {
    return withRetry(() => _supabase.from('events').insert(eventToRow(ev)).then(({error}) => { if(error) throw error; }));
  },
  async updateEvent(id, changes) {
    const row = {};
    if (changes.title !== undefined) row.title       = changes.title;
    if (changes.desc !== undefined)  row.description = changes.desc;
    if (changes.date !== undefined)  row.event_date  = changes.date;
    if (changes.time !== undefined)  row.event_time  = changes.time || null;
    return withRetry(() => _supabase.from('events').update(row).eq('id', id).then(({error}) => { if(error) throw error; }));
  },
  async deleteEvent(id) {
    return withRetry(() => _supabase.from('events').delete().eq('id', id).then(({error}) => { if(error) throw error; }));
  }
};

function rowToTask(r) {
  return { id: r.id, title: r.title, desc: r.description || '', priority: r.priority, status: r.status, due: r.due_date || '' };
}
function taskToRow(t) {
  return { id: t.id, title: t.title, description: t.desc || '', priority: t.priority, status: t.status, due_date: t.due || null, user_id: state.userId };
}
function rowToEvent(r) {
  return { id: r.id, title: r.title, desc: r.description || '', date: r.event_date, time: r.event_time ? r.event_time.slice(0,5) : '' };
}
function eventToRow(e) {
  return { id: e.id, title: e.title, description: e.desc || '', event_date: e.date, event_time: e.time || null, user_id: state.userId };
}

// ===== AUTH =====
function showLoginScreen() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('user-menu').style.display = 'none';
  lucide.createIcons();
}
function hideLoginScreen() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('user-menu').style.display = 'flex';
}

function toggleAuthMode() {
  state.authMode = state.authMode === 'login' ? 'signup' : 'login';
  const submitBtn = document.getElementById('auth-submit');
  const toggle = document.querySelector('.auth-toggle button');
  if (state.authMode === 'signup') {
    submitBtn.textContent = 'Criar conta';
    toggle.textContent = 'Já tenho conta';
  } else {
    submitBtn.textContent = 'Entrar';
    toggle.textContent = 'Criar conta grátis';
  }
  document.getElementById('auth-error').textContent = '';
}

async function loginWithGoogle() {
  const { error } = await _supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin }
  });
  if (error) document.getElementById('auth-error').textContent = error.message;
}

async function submitAuthForm(e) {
  e.preventDefault();
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const errEl = document.getElementById('auth-error');
  const btn = document.getElementById('auth-submit');
  errEl.textContent = '';
  btn.disabled = true;
  btn.textContent = state.authMode === 'login' ? 'Entrando...' : 'Criando conta...';
  try {
    let result;
    if (state.authMode === 'login') {
      result = await _supabase.auth.signInWithPassword({ email, password });
    } else {
      result = await _supabase.auth.signUp({ email, password });
      if (!result.error && result.data.user && !result.data.session) {
        errEl.style.color = '#059669';
        errEl.textContent = 'Verifique seu e-mail para confirmar o cadastro!';
        btn.disabled = false; btn.textContent = 'Criar conta'; return;
      }
    }
    if (result.error) { errEl.style.color = ''; errEl.textContent = result.error.message; }
  } finally {
    btn.disabled = false;
    btn.textContent = state.authMode === 'login' ? 'Entrar' : 'Criar conta';
  }
}

async function logout() {
  await _supabase.auth.signOut();
  state.tasks = []; state.events = [];
  state.userId = null; state.userEmail = null;
  showLoginScreen();
}

function setUserInfo(user) {
  state.userId = user.id;
  state.userEmail = user.email;
  const initials = (user.email || '?')[0].toUpperCase();
  document.getElementById('user-avatar').textContent = initials;
  document.getElementById('user-email').textContent = user.email || '';
}

// ===== UTILS =====
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function fmtDate(str) { if (!str) return ''; const [y,m,d] = str.split('-'); return `${d}/${m}/${y}`; }
function fmtMonthYear(y, m) { return new Date(y, m, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); }
function isToday(ds) { return ds === today(); }
function isThisWeek(ds) {
  const t = new Date(), d = new Date(ds + 'T00:00:00');
  const diff = (d - new Date(t.getFullYear(), t.getMonth(), t.getDate())) / 86400000;
  return diff >= 0 && diff < 7;
}
function priorityLabel(p) { return { high:'Alta', medium:'Média', low:'Baixa' }[p] || p; }
function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ===== LOADING =====
function showLoading() { document.getElementById('app-loading').classList.remove('hidden'); }
function hideLoading() { document.getElementById('app-loading').classList.add('hidden'); }

// ===== CLOCK =====
function updateClock() {
  const el = document.getElementById('datetime-display');
  if (!el) return;
  const now = new Date();
  el.innerHTML = `<strong>${now.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</strong><br>${now.toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'short'})}`;
}

// ===== VIEW SWITCH =====
function switchView(view) {
  state.currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('view-' + view).classList.remove('hidden');
  document.getElementById('nav-' + view).classList.add('active');
  const titles = { tasks:['Quadro de Tarefas','Organize suas atividades'], agenda:['Agenda','Seus compromissos'], calendar:['Calendário','Visão mensal'] };
  document.getElementById('view-title').textContent = titles[view][0];
  document.getElementById('view-subtitle').textContent = titles[view][1];
  if (view === 'agenda') renderAgenda();
  if (view === 'calendar') renderCalendar();
  if (view === 'tasks') renderTasks();
}
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('collapsed'); }

// ===== TASKS =====
function renderTasks() {
  ['todo','doing','done'].forEach(status => {
    const tasks = state.tasks.filter(t => t.status === status);
    document.getElementById('cards-' + status).innerHTML = tasks.map(taskCardHTML).join('');
    document.getElementById('count-' + status).textContent = tasks.length;
  });
  document.getElementById('stat-done').textContent = state.tasks.filter(t => t.status === 'done').length;
  document.getElementById('stat-today').textContent = state.events.filter(e => isToday(e.date)).length;
  updateAgendaBadge();
  lucide.createIcons();
}
function taskCardHTML(t) {
  const overdue = t.due && t.due < today() && t.status !== 'done';
  const dueHTML = t.due ? `<span class="card-due ${overdue?'overdue':''}"><i data-lucide="calendar"></i>${fmtDate(t.due)}${overdue?' · Atrasada':''}</span>` : '';
  return `<div class="task-card" data-priority="${t.priority}" data-id="${t.id}" draggable="true" ondragstart="onDragStart(event,'${t.id}')" ondragend="onDragEnd(event)">
    <div class="card-header"><span class="card-title">${escHtml(t.title)}</span>
    <div class="card-actions"><button class="card-action-btn" onclick="editTask('${t.id}')"><i data-lucide="pencil"></i></button><button class="card-action-btn delete" onclick="askDelete('${t.id}','task')"><i data-lucide="trash-2"></i></button></div></div>
    ${t.desc?`<div class="card-desc">${escHtml(t.desc)}</div>`:''}
    <div class="card-meta"><span class="priority-badge priority-${t.priority}">${priorityLabel(t.priority)}</span>${dueHTML}</div></div>`;
}

// ===== DRAG & DROP =====
let draggingId = null;
function onDragStart(e, id) { draggingId = id; e.currentTarget.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; }
function onDragEnd(e) { e.currentTarget.classList.remove('dragging'); draggingId = null; }
function onDragOver(e) { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }
async function onDrop(e, status) {
  e.preventDefault();
  document.querySelectorAll('.cards-container').forEach(c => c.classList.remove('drag-over'));
  if (!draggingId) return;
  const task = state.tasks.find(t => t.id === draggingId);
  if (!task || task.status === status) { draggingId = null; return; }
  task.status = status; renderTasks();
  try { await db.updateTask(task.id, { status }); showToast('Tarefa movida!'); }
  catch { showToast('Erro ao mover.', 'error'); await reloadData(); renderTasks(); }
  draggingId = null;
}

// ===== AGENDA =====
function filterAgenda(filter, btn) {
  state.agendaFilter = filter;
  document.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active'); renderAgenda();
}
function renderAgenda() {
  const list = document.getElementById('agenda-list'), empty = document.getElementById('agenda-empty');
  let events = [...state.events].sort((a,b) => (a.date+(a.time||'00:00')).localeCompare(b.date+(b.time||'00:00')));
  if (state.agendaFilter === 'today') events = events.filter(e => isToday(e.date));
  if (state.agendaFilter === 'week')  events = events.filter(e => isThisWeek(e.date));
  empty.classList.toggle('hidden', events.length > 0);
  if (!events.length) { list.innerHTML = ''; return; }
  const groups = {};
  events.forEach(e => { if (!groups[e.date]) groups[e.date] = []; groups[e.date].push(e); });
  list.innerHTML = Object.keys(groups).sort().map(d => `<div class="agenda-group-label">${isToday(d)?'Hoje':fmtDate(d)}</div>${groups[d].map(eventCardHTML).join('')}`).join('');
  lucide.createIcons();
}
function eventCardHTML(ev) {
  const hour = ev.time ? ev.time.slice(0,5) : '--:--';
  const ds = new Date(ev.date+'T00:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'});
  return `<div class="event-card" data-id="${ev.id}">
    <div class="event-time-block"><div class="event-time-hour">${hour}</div><div class="event-time-date">${ds}</div></div>
    <div class="event-info"><div class="event-title">${escHtml(ev.title)}</div>${ev.desc?`<div class="event-desc">${escHtml(ev.desc)}</div>`:''}</div>
    <div class="event-actions"><button class="card-action-btn" onclick="editEvent('${ev.id}')"><i data-lucide="pencil"></i></button><button class="card-action-btn delete" onclick="askDelete('${ev.id}','event')"><i data-lucide="trash-2"></i></button></div></div>`;
}
function updateAgendaBadge() {
  const c = state.events.filter(e => isToday(e.date) || isThisWeek(e.date)).length;
  document.getElementById('badge-agenda').textContent = c > 0 ? c : '';
}

// ===== CALENDAR =====
function renderCalendar() {
  document.getElementById('cal-month-label').textContent = fmtMonthYear(state.calYear, state.calMonth);
  const first = new Date(state.calYear, state.calMonth, 1).getDay();
  const days = new Date(state.calYear, state.calMonth+1, 0).getDate();
  const prev = new Date(state.calYear, state.calMonth, 0).getDate();
  const evDates = new Set(state.events.map(e => e.date));
  const td = today();
  let html = '';
  for (let i=first-1; i>=0; i--) html += `<div class="cal-day other-month empty">${prev-i}</div>`;
  for (let d=1; d<=days; d++) {
    const ds = `${state.calYear}-${String(state.calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const cls = [ds===td&&ds!==state.selectedDay?'today':'', ds===state.selectedDay?'selected':'', evDates.has(ds)?'has-event':''].filter(Boolean).join(' ');
    html += `<div class="cal-day ${cls}" onclick="selectDay('${ds}')">${d}</div>`;
  }
  const rem = (first+days)%7===0 ? 0 : 7-(first+days)%7;
  for (let i=1; i<=rem; i++) html += `<div class="cal-day other-month empty">${i}</div>`;
  document.getElementById('cal-days').innerHTML = html;
}
function changeMonth(dir) {
  state.calMonth += dir;
  if (state.calMonth>11) { state.calMonth=0; state.calYear++; }
  if (state.calMonth<0)  { state.calMonth=11; state.calYear--; }
  renderCalendar();
}
function selectDay(ds) {
  state.selectedDay = ds; renderCalendar();
  document.getElementById('selected-day-label').textContent = isToday(ds) ? 'Hoje' : fmtDate(ds);
  const evs = state.events.filter(e => e.date === ds);
  document.getElementById('day-events').innerHTML = evs.length
    ? evs.map(eventCardHTML).join('')
    : `<div class="empty-state-sm"><i data-lucide="calendar"></i><p>Sem compromissos neste dia</p></div>`;
  lucide.createIcons();
}

// ===== MODAL =====
let currentModalType = 'task';
function openAddModal(forcedType, defaultStatus) {
  state.editingId = null;
  state.defaultStatus = defaultStatus || 'todo';
  currentModalType = forcedType || (state.currentView==='agenda'||state.currentView==='calendar' ? 'event' : 'task');
  document.getElementById('modal-form').reset();
  document.getElementById('f-status').value = state.defaultStatus;
  document.getElementById('f-date').value = state.selectedDay || today();
  const sel = document.getElementById('type-selector');
  sel.style.display = forcedType ? 'none' : 'flex';
  document.getElementById('type-btn-task').classList.toggle('active', currentModalType==='task');
  document.getElementById('type-btn-event').classList.toggle('active', currentModalType==='event');
  setModalType(currentModalType, true);
  document.getElementById('modal-title').textContent = currentModalType==='task' ? 'Nova Tarefa' : 'Novo Compromisso';
  document.getElementById('modal-overlay').classList.remove('hidden');
  lucide.createIcons();
  setTimeout(() => document.getElementById('f-title').focus(), 100);
}
function setModalType(type, skip) {
  currentModalType = type;
  if (!skip) {
    document.getElementById('type-btn-task').classList.toggle('active', type==='task');
    document.getElementById('type-btn-event').classList.toggle('active', type==='event');
  }
  document.getElementById('task-fields').style.display = type==='task' ? '' : 'none';
  document.getElementById('event-fields').style.display = type==='event' ? '' : 'none';
  document.getElementById('modal-title').textContent = state.editingId ? (type==='task'?'Editar Tarefa':'Editar Compromisso') : (type==='task'?'Nova Tarefa':'Novo Compromisso');
  lucide.createIcons();
}
function closeModal(e) { if (e.target===document.getElementById('modal-overlay')) closeModalDirect(); }
function closeModalDirect() { document.getElementById('modal-overlay').classList.add('hidden'); state.editingId=null; }

// ===== SAVE =====
async function saveItem(e) {
  e.preventDefault();
  const title = document.getElementById('f-title').value.trim();
  if (!title) return;
  const btn = document.getElementById('btn-save');
  btn.disabled = true; btn.textContent = 'Salvando...';
  try {
    if (currentModalType === 'task') {
      const data = { title, desc: document.getElementById('f-desc').value.trim(), priority: document.getElementById('f-priority').value, status: document.getElementById('f-status').value, due: document.getElementById('f-due').value };
      if (state.editingId) { await db.updateTask(state.editingId, data); Object.assign(state.tasks.find(t=>t.id===state.editingId)||{}, data); showToast('Tarefa atualizada!'); }
      else { const t = { id:uid(), ...data }; await db.createTask(t); state.tasks.push(t); showToast('Tarefa criada!'); }
    } else {
      const dv = document.getElementById('f-date').value;
      if (!dv) { showToast('Selecione uma data!','error'); return; }
      const data = { title, desc: document.getElementById('f-desc').value.trim(), date: dv, time: document.getElementById('f-time').value };
      if (state.editingId) { await db.updateEvent(state.editingId, data); Object.assign(state.events.find(e=>e.id===state.editingId)||{}, data); showToast('Compromisso atualizado!'); }
      else { const ev = { id:uid(), ...data }; await db.createEvent(ev); state.events.push(ev); showToast('Compromisso adicionado!'); }
    }
    closeModalDirect(); renderTasks();
    if (state.currentView==='agenda') renderAgenda();
    if (state.currentView==='calendar') { renderCalendar(); if (state.selectedDay) selectDay(state.selectedDay); }
  } catch (err) { console.error(err); showToast('Erro ao salvar.','error'); }
  finally { btn.disabled=false; btn.textContent='Salvar'; }
}

// ===== EDIT =====
function editTask(id) {
  const t = state.tasks.find(t=>t.id===id); if (!t) return;
  state.editingId = id;
  document.getElementById('type-selector').style.display='none';
  setModalType('task',true);
  document.getElementById('modal-title').textContent='Editar Tarefa';
  document.getElementById('f-title').value=t.title;
  document.getElementById('f-desc').value=t.desc||'';
  document.getElementById('f-priority').value=t.priority;
  document.getElementById('f-status').value=t.status;
  document.getElementById('f-due').value=t.due||'';
  document.getElementById('modal-overlay').classList.remove('hidden');
  setTimeout(()=>document.getElementById('f-title').focus(),100);
}
function editEvent(id) {
  const ev = state.events.find(e=>e.id===id); if (!ev) return;
  state.editingId = id;
  document.getElementById('type-selector').style.display='none';
  setModalType('event',true);
  document.getElementById('modal-title').textContent='Editar Compromisso';
  document.getElementById('f-title').value=ev.title;
  document.getElementById('f-desc').value=ev.desc||'';
  document.getElementById('f-date').value=ev.date;
  document.getElementById('f-time').value=ev.time||'';
  document.getElementById('modal-overlay').classList.remove('hidden');
  setTimeout(()=>document.getElementById('f-title').focus(),100);
}

// ===== DELETE =====
function askDelete(id, kind) {
  state.deleteId=id; state.deleteKind=kind;
  document.getElementById('confirm-text').textContent=`Tem certeza que deseja excluir ${kind==='task'?'esta tarefa':'este compromisso'}?`;
  document.getElementById('confirm-overlay').classList.remove('hidden');
}
function closeConfirm(e) { if (e.target===document.getElementById('confirm-overlay')) closeConfirmDirect(); }
function closeConfirmDirect() { document.getElementById('confirm-overlay').classList.add('hidden'); state.deleteId=null; state.deleteKind=null; }
async function confirmDelete() {
  if (!state.deleteId) return;
  const btn = document.getElementById('btn-confirm-delete');
  btn.disabled=true; btn.textContent='Excluindo...';
  try {
    if (state.deleteKind==='task') { await db.deleteTask(state.deleteId); state.tasks=state.tasks.filter(t=>t.id!==state.deleteId); showToast('Tarefa excluída.'); }
    else { await db.deleteEvent(state.deleteId); state.events=state.events.filter(e=>e.id!==state.deleteId); showToast('Compromisso excluído.'); }
    renderTasks();
    if (state.currentView==='agenda') renderAgenda();
    if (state.currentView==='calendar') { renderCalendar(); if (state.selectedDay) selectDay(state.selectedDay); }
  } catch { showToast('Erro ao excluir.','error'); }
  finally { btn.disabled=false; btn.textContent='Excluir'; closeConfirmDirect(); }
}

// ===== TOAST =====
function showToast(msg, type='success') {
  const t = document.createElement('div');
  t.className=`toast ${type}`; t.textContent=msg;
  document.getElementById('toast-container').appendChild(t);
  setTimeout(()=>{ t.style.cssText='opacity:0;transform:translateX(20px);transition:.3s'; setTimeout(()=>t.remove(),300); },2500);
}

// ===== DATA RELOAD =====
async function reloadData() {
  const [tasks, events] = await Promise.all([db.loadTasks(), db.loadEvents()]);
  state.tasks=tasks; state.events=events;
}

// ===== INIT =====
async function init() {
  updateClock();
  setInterval(updateClock, 30000);

  // Listen for auth changes
  _supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      setUserInfo(session.user);
      hideLoginScreen();
      await reloadData();
      renderTasks();
      switchView('tasks');
      lucide.createIcons();
      hideLoading();
    }
    if (event === 'SIGNED_OUT') {
      state.tasks=[]; state.events=[];
      showLoginScreen(); hideLoading();
    }
  });

  // Check existing session
  const { data: { session } } = await _supabase.auth.getSession();
  if (session) {
    setUserInfo(session.user);
    hideLoginScreen();
    await reloadData();
    renderTasks();
    switchView('tasks');
    lucide.createIcons();
    hideLoading();
  } else {
    hideLoading();
    showLoginScreen();
  }
}

document.addEventListener('DOMContentLoaded', init);
