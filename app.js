(function(){
  const CATS = {
    expense: ['Comida','Transporte','Vivienda','Servicios','Salud','Ocio','Otros'],
    income: ['Sueldo','Freelance','Regalo','Otros']
  };

  let state = { initial: null, transactions: [], reminders: [] };
  let period = 'today'; // today | week | month
  let sheetMode = null; // 'add' | 'edit' | null
  let sheetType = 'expense';
  let editingId = null;
  let editingReminderId = null;
  let storageOk = true;

  const el = id => document.getElementById(id);
  const fmt = n => {
    const sign = n < 0 ? '-' : '';
    const v = Math.abs(n).toFixed(2);
    const [int, dec] = v.split('.');
    const withCommas = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return { sign, int: withCommas, dec };
  };
  const money = n => {
    const {sign,int,dec} = fmt(n);
    return `${sign}S/ ${int}.${dec}`;
  };

  // Usa window.storage cuando está disponible (dentro de Claude);
  // si la app corre de forma independiente (hospedada, file://, etc.)
  // usa localStorage del navegador como respaldo, con la misma forma de uso.
  const hasClaudeStorage = typeof window.storage !== 'undefined';
  const LOCAL_KEY = 'wallet-data';

  async function loadData(){
    try{
      if(hasClaudeStorage){
        const res = await window.storage.get('wallet-data', false);
        if(res && res.value){ state = JSON.parse(res.value); }
      } else {
        const raw = localStorage.getItem(LOCAL_KEY);
        if(raw){ state = JSON.parse(raw); }
      }
    }catch(e){
      storageOk = true; // la clave simplemente no existe todavía
    }
    if(!Array.isArray(state.reminders)) state.reminders = [];
  }

  async function saveData(){
    try{
      if(hasClaudeStorage){
        await window.storage.set('wallet-data', JSON.stringify(state), false);
      } else {
        localStorage.setItem(LOCAL_KEY, JSON.stringify(state));
      }
    }catch(e){
      console.error('No se pudo guardar', e);
    }
  }

  function uid(){
    return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
  }

  function totalBalance(){
    let t = state.initial || 0;
    for(const tx of state.transactions){
      t += tx.type === 'income' ? tx.amount : -tx.amount;
    }
    return t;
  }

  function startOfWeek(d){
    const date = new Date(d);
    const day = (date.getDay() + 6) % 7; // Monday = 0
    date.setDate(date.getDate() - day);
    date.setHours(0,0,0,0);
    return date;
  }

  function inPeriod(dateStr, p){
    const d = new Date(dateStr + 'T00:00:00');
    const now = new Date();
    now.setHours(0,0,0,0);
    if(p === 'today'){
      return d.getTime() === now.getTime();
    }
    if(p === 'week'){
      const start = startOfWeek(now);
      const end = new Date(start); end.setDate(end.getDate()+6);
      return d >= start && d <= end;
    }
    if(p === 'month'){
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }
    return true;
  }

  function periodTotals(p){
    let income = 0, expense = 0;
    for(const tx of state.transactions){
      if(inPeriod(tx.date, p)){
        if(tx.type === 'income') income += tx.amount; else expense += tx.amount;
      }
    }
    return { income, expense };
  }

  function dayLabel(dateStr){
    const d = new Date(dateStr + 'T00:00:00');
    const now = new Date(); now.setHours(0,0,0,0);
    const diff = Math.round((now - d) / 86400000);
    if(diff === 0) return 'Hoy';
    if(diff === 1) return 'Ayer';
    return d.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  function groupedTransactions(){
    const sorted = [...state.transactions].sort((a,b) => (b.date+b.id).localeCompare(a.date+a.id));
    const groups = {};
    for(const tx of sorted){
      if(!groups[tx.date]) groups[tx.date] = [];
      groups[tx.date].push(tx);
    }
    return groups;
  }

  function todayStr(){
    const d = new Date();
    return d.toISOString().slice(0,10);
  }

  // Devuelve una fecha válida para "día" dentro de un mes dado,
  // usando el último día del mes si ese mes tiene menos días (ej. 31 en febrero).
  function clampedDate(year, month, day){
    const lastDay = new Date(year, month + 1, 0).getDate();
    return new Date(year, month, Math.min(day, lastDay));
  }

  function daysUntilDay(day){
    const now = new Date(); now.setHours(0,0,0,0);
    let target = clampedDate(now.getFullYear(), now.getMonth(), day);
    if(target < now){
      let m = now.getMonth() + 1, y = now.getFullYear();
      if(m > 11){ m = 0; y++; }
      target = clampedDate(y, m, day);
    }
    return Math.round((target - now) / 86400000);
  }

  function reminderStatusLabel(diff){
    if(diff === 0) return 'Vence hoy';
    if(diff === 1) return 'Vence mañana';
    return `Faltan ${diff} días`;
  }

  function sortedReminders(){
    return [...state.reminders]
      .map(r => ({ ...r, diff: daysUntilDay(r.day) }))
      .sort((a, b) => a.diff - b.diff);
  }

  // ---------- render ----------
  function render(){
    const app = el('app');
    if(state.initial === null){
      app.innerHTML = renderOnboard();
      bindOnboard();
      return;
    }
    app.innerHTML = renderMain();
    bindMain();
  }

  function renderOnboard(){
    return `
      <div class="onboard">
        <div class="display">Empecemos</div>
        <p>Antes de registrar tus movimientos, cuéntame cuánto dinero tienes disponible ahora mismo.</p>
        <div class="field">
          <label for="ob-amount">Dinero actual (S/)</label>
          <input id="ob-amount" class="amount-input" type="number" inputmode="decimal" step="0.01" placeholder="0.00" autofocus>
        </div>
        <div class="sheet-actions" style="max-width:260px;width:100%;">
          <button class="btn primary" id="ob-continue" style="flex:1;">Continuar</button>
        </div>
      </div>
    `;
  }

  function bindOnboard(){
    el('ob-continue').onclick = async () => {
      const v = parseFloat(el('ob-amount').value);
      state.initial = isNaN(v) ? 0 : v;
      await saveData();
      render();
    };
  }

  function renderMain(){
    const bal = totalBalance();
    const {sign,int,dec} = fmt(bal);
    const totals = periodTotals(period);
    const groups = groupedTransactions();
    const dates = Object.keys(groups);

    let listHtml = '';
    if(dates.length === 0){
      listHtml = `
        <div class="empty-state">
          <div class="display">Aún no hay movimientos</div>
          <p>Toca "Ingreso" o "Gasto" arriba para registrar tu primer movimiento del día.</p>
        </div>`;
    } else {
      listHtml = dates.map(date => {
        const rows = groups[date].map(tx => `
          <div class="entry" data-id="${tx.id}">
            <div class="entry-dot ${tx.type}"></div>
            <div class="entry-info">
              <div class="entry-cat">${tx.category}</div>
              ${tx.note ? `<div class="entry-note">${escapeHtml(tx.note)}</div>` : ''}
            </div>
            <div class="entry-amount ${tx.type}">${tx.type === 'income' ? '+' : '−'} ${money(tx.amount)}</div>
          </div>
        `).join('');
        return `
          <div class="day-group">
            <div class="day-label">${dayLabel(date)}</div>
            ${rows}
          </div>
        `;
      }).join('');
    }

    const reminders = sortedReminders();
    const dueSoon = reminders.filter(r => r.diff <= 3);

    let bannerHtml = '';
    if(dueSoon.length > 0){
      bannerHtml = `
        <div class="alert-banner">
          <div class="alert-title">Por vencer</div>
          ${dueSoon.map(r => `
            <div class="alert-row">
              <div>
                <div class="a-name">${escapeHtml(r.name)}</div>
                <div class="a-when">${reminderStatusLabel(r.diff)}</div>
              </div>
              ${r.amount ? `<div class="a-amount">${money(r.amount)}</div>` : ''}
            </div>
          `).join('')}
        </div>
      `;
    }

    let remindersHtml = '';
    if(reminders.length === 0){
      remindersHtml = `<p style="font-size:13px;color:var(--text-dim);padding:4px 4px 20px;">Aún no tienes pagos recurrentes registrados.</p>`;
    } else {
      remindersHtml = reminders.map(r => `
        <div class="reminder-entry" data-id="${r.id}">
          <div class="reminder-day">${r.day}</div>
          <div class="reminder-info">
            <div class="reminder-name">${escapeHtml(r.name)}</div>
            <div class="reminder-sub ${r.diff <= 3 ? 'due' : ''}">${reminderStatusLabel(r.diff)}</div>
          </div>
          ${r.amount ? `<div class="reminder-amount">${money(r.amount)}</div>` : ''}
        </div>
      `).join('');
    }

    return `
      <div class="topbar">
        <div class="name display">Billetera</div>
        <div class="icon-btn" id="settings-btn" title="Ajustar saldo">&#9881;</div>
      </div>

      ${bannerHtml}

      <div class="balance-card">
        <div class="balance-label">Saldo actual</div>
        <div class="balance-amount display">${sign}S/ ${int}<span class="cents">.${dec}</span></div>
        <div class="quick-actions">
          <div class="qa-btn income" id="btn-add-income">+ Ingreso</div>
          <div class="qa-btn expense" id="btn-add-expense">+ Gasto</div>
        </div>
      </div>

      <div class="period-tabs">
        <div class="period-tab ${period==='today'?'active':''}" data-p="today">Hoy</div>
        <div class="period-tab ${period==='week'?'active':''}" data-p="week">Semana</div>
        <div class="period-tab ${period==='month'?'active':''}" data-p="month">Mes</div>
      </div>
      <div class="period-summary">
        <div class="ps-card in">
          <div class="ps-label">Ingresos</div>
          <div class="ps-value">${money(totals.income)}</div>
        </div>
        <div class="ps-card out">
          <div class="ps-label">Gastos</div>
          <div class="ps-value">${money(totals.expense)}</div>
        </div>
      </div>

      <div class="section-title">
        <span>Recordatorios</span>
        <div class="icon-btn" id="add-reminder-btn" title="Nuevo recordatorio" style="width:28px;height:28px;font-size:14px;">+</div>
      </div>
      ${remindersHtml}

      <div class="section-title" style="margin-top:8px;">
        <span>Movimientos</span>
        <span class="count">${state.transactions.length}</span>
      </div>
      ${listHtml}

      <div id="overlay" class="overlay"><div id="sheet-container"></div></div>
    `;
  }

  function escapeHtml(s){
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function bindMain(){
    el('btn-add-income').onclick = () => openSheet('add', 'income');
    el('btn-add-expense').onclick = () => openSheet('add', 'expense');
    el('settings-btn').onclick = () => openSettingsSheet();
    el('add-reminder-btn').onclick = () => openReminderSheet('add');

    document.querySelectorAll('.period-tab').forEach(t => {
      t.onclick = () => { period = t.dataset.p; render(); };
    });

    document.querySelectorAll('.entry').forEach(row => {
      row.onclick = () => openSheet('edit', null, row.dataset.id);
    });

    document.querySelectorAll('.reminder-entry').forEach(row => {
      row.onclick = () => openReminderSheet('edit', row.dataset.id);
    });
  }

  // ---------- sheets ----------
  function openOverlay(html){
    const overlay = el('overlay');
    overlay.querySelector('#sheet-container') ? null : null;
    overlay.innerHTML = `<div id="sheet-container">${html}</div>`;
    overlay.classList.add('show');
    overlay.onclick = (e) => { if(e.target === overlay) closeOverlay(); };
  }
  function closeOverlay(){
    const overlay = el('overlay');
    if(overlay){ overlay.classList.remove('show'); overlay.innerHTML = ''; }
  }

  function openSheet(mode, type, id){
    sheetMode = mode;
    let tx = null;
    if(mode === 'edit'){
      tx = state.transactions.find(t => t.id === id);
      if(!tx) return;
      editingId = id;
      sheetType = tx.type;
    } else {
      editingId = null;
      sheetType = type;
    }

    const cats = CATS[sheetType];
    const amount = tx ? tx.amount : '';
    const note = tx ? (tx.note || '') : '';
    const date = tx ? tx.date : todayStr();
    const selectedCat = tx ? tx.category : cats[0];

    const html = `
      <div class="sheet">
        <div class="sheet-title">${mode === 'edit' ? 'Editar movimiento' : (sheetType === 'income' ? 'Nuevo ingreso' : 'Nuevo gasto')}</div>
        <div class="type-toggle">
          <div class="type-opt income ${sheetType==='income'?'sel income':''}" id="tt-income">Ingreso</div>
          <div class="type-opt expense ${sheetType==='expense'?'sel expense':''}" id="tt-expense">Gasto</div>
        </div>
        <div class="field">
          <label for="f-amount">Monto (S/)</label>
          <input id="f-amount" class="amount-input" type="number" inputmode="decimal" step="0.01" placeholder="0.00" value="${amount}">
        </div>
        <div class="field">
          <label for="f-cat">Categoría</label>
          <select id="f-cat">
            ${cats.map(c => `<option value="${c}" ${c===selectedCat?'selected':''}>${c}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="f-date">Fecha</label>
          <input id="f-date" type="date" value="${date}">
        </div>
        <div class="field">
          <label for="f-note">Nota (opcional)</label>
          <input id="f-note" type="text" placeholder="Ej. almuerzo con Ana" value="${escapeHtml(note)}">
        </div>
        <div class="sheet-actions">
          ${mode==='edit' ? `<button class="btn danger" id="btn-delete">Eliminar</button>` : `<button class="btn ghost" id="btn-cancel">Cancelar</button>`}
          <button class="btn primary" id="btn-save">Guardar</button>
        </div>
      </div>
    `;
    openOverlay(html);

    el('tt-income').onclick = () => { sheetType='income'; openSheet(mode, 'income', id); };
    el('tt-expense').onclick = () => { sheetType='expense'; openSheet(mode, 'expense', id); };
    if(el('btn-cancel')) el('btn-cancel').onclick = closeOverlay;
    if(el('btn-delete')) el('btn-delete').onclick = async () => {
      state.transactions = state.transactions.filter(t => t.id !== editingId);
      await saveData();
      closeOverlay();
      render();
    };
    el('btn-save').onclick = async () => {
      const amt = parseFloat(el('f-amount').value);
      if(isNaN(amt) || amt <= 0){ el('f-amount').focus(); return; }
      const cat = el('f-cat').value;
      const dt = el('f-date').value || todayStr();
      const nt = el('f-note').value.trim();

      if(mode === 'edit'){
        const tx = state.transactions.find(t => t.id === editingId);
        tx.type = sheetType; tx.amount = amt; tx.category = cat; tx.date = dt; tx.note = nt;
      } else {
        state.transactions.push({ id: uid(), type: sheetType, amount: amt, category: cat, date: dt, note: nt });
      }
      await saveData();
      closeOverlay();
      render();
    };
  }

  function openSettingsSheet(){
    const html = `
      <div class="sheet">
        <div class="sheet-title">Ajustar saldo</div>
        <div class="field">
          <label for="f-init">Dinero actual (S/), sin contar movimientos registrados</label>
          <input id="f-init" class="amount-input" type="number" inputmode="decimal" step="0.01" value="${state.initial}">
        </div>
        <div class="sheet-actions">
          <button class="btn ghost" id="btn-cancel2">Cancelar</button>
          <button class="btn primary" id="btn-save2">Guardar</button>
        </div>
      </div>
    `;
    openOverlay(html);
    el('btn-cancel2').onclick = closeOverlay;
    el('btn-save2').onclick = async () => {
      const v = parseFloat(el('f-init').value);
      state.initial = isNaN(v) ? 0 : v;
      await saveData();
      closeOverlay();
      render();
    };
  }

  function openReminderSheet(mode, id){
    let rem = null;
    if(mode === 'edit'){
      rem = state.reminders.find(r => r.id === id);
      if(!rem) return;
      editingReminderId = id;
    } else {
      editingReminderId = null;
    }

    const name = rem ? rem.name : '';
    const day = rem ? rem.day : '';
    const amount = rem ? (rem.amount || '') : '';

    const html = `
      <div class="sheet">
        <div class="sheet-title">${mode === 'edit' ? 'Editar recordatorio' : 'Nuevo recordatorio'}</div>
        <div class="field">
          <label for="r-name">Nombre</label>
          <input id="r-name" type="text" placeholder="Ej. Línea telefónica" value="${escapeHtml(name)}">
        </div>
        <div class="field">
          <label for="r-day">Día del mes en que vence (1 al 31)</label>
          <input id="r-day" type="number" inputmode="numeric" min="1" max="31" placeholder="Ej. 10" value="${day}">
        </div>
        <div class="field">
          <label for="r-amount">Monto aproximado (S/), opcional</label>
          <input id="r-amount" class="amount-input" type="number" inputmode="decimal" step="0.01" placeholder="0.00" value="${amount}">
        </div>
        <div class="sheet-actions">
          ${mode==='edit' ? `<button class="btn danger" id="btn-delete-rem">Eliminar</button>` : `<button class="btn ghost" id="btn-cancel-rem">Cancelar</button>`}
          <button class="btn primary" id="btn-save-rem">Guardar</button>
        </div>
      </div>
    `;
    openOverlay(html);

    if(el('btn-cancel-rem')) el('btn-cancel-rem').onclick = closeOverlay;
    if(el('btn-delete-rem')) el('btn-delete-rem').onclick = async () => {
      state.reminders = state.reminders.filter(r => r.id !== editingReminderId);
      await saveData();
      closeOverlay();
      render();
    };
    el('btn-save-rem').onclick = async () => {
      const nm = el('r-name').value.trim();
      let dy = parseInt(el('r-day').value, 10);
      const amt = parseFloat(el('r-amount').value);

      if(!nm){ el('r-name').focus(); return; }
      if(isNaN(dy) || dy < 1 || dy > 31){ el('r-day').focus(); return; }

      if(mode === 'edit'){
        const rem = state.reminders.find(r => r.id === editingReminderId);
        rem.name = nm; rem.day = dy; rem.amount = isNaN(amt) ? null : amt;
      } else {
        state.reminders.push({ id: uid(), name: nm, day: dy, amount: isNaN(amt) ? null : amt });
      }
      await saveData();
      closeOverlay();
      render();
    };
  }

  // ---------- init ----------
  (async function init(){
    el('app').innerHTML = `<div class="onboard"><div class="display">Cargando…</div></div>`;
    await loadData();
    render();
  })();

  // Registra el service worker solo cuando la app corre hospedada
  // (http/https), no dentro del visor de Claude ni en file://.
  if('serviceWorker' in navigator && /^https?:$/.test(location.protocol)){
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }
})();
