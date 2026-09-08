/**
 * Estado, persistencia (localStorage) y UI del 4Pi Ads Dashboard.
 * El motor de reglas del método vive en rules.js (window.FourPi).
 */
(function () {
  'use strict';

  const STORAGE_KEY = '4pi-dashboard-data-v1';

  const defaultState = () => ({
    account: '',
    period: '',
    resultLabel: 'Resultado',
    ads: [],
  });

  let state = loadState();
  let editingAdId = null; // anuncio en edición en modal-ad
  let detailAdId = null; // anuncio abierto en modal-detail

  // ---------- Persistencia ----------

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      return { ...defaultState(), ...parsed, ads: Array.isArray(parsed.ads) ? parsed.ads : [] };
    } catch (err) {
      console.warn('No se pudo leer el estado guardado, arranco de cero.', err);
      return defaultState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      showToast('No se pudo guardar en este navegador (localStorage lleno o bloqueado).');
      console.error(err);
    }
  }

  function uid() {
    return 'ad-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  // ---------- Helpers de formato ----------

  function fmtMoney(n) {
    if (typeof n !== 'number' || Number.isNaN(n)) return '—';
    return '$' + n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtNum(n, decimals) {
    if (typeof n !== 'number' || Number.isNaN(n)) return '—';
    return n.toLocaleString('es-AR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }

  function arrowFor(dir) {
    if (dir === 'above') return '<span class="arrow-above">▲</span>';
    if (dir === 'below') return '<span class="arrow-below">▼</span>';
    if (dir === 'avg') return '<span class="arrow-avg">≈</span>';
    return '';
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  let toastTimer = null;
  function showToast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.hidden = true;
    }, 2600);
  }

  // ---------- Render ----------

  function getFilteredAds() {
    const roleFilter = document.getElementById('filter-role').value;
    const flagsOnly = document.getElementById('filter-flags').checked;
    const averages = FourPi.computeAverages(state.ads);

    return state.ads.filter((ad) => {
      if (roleFilter && ad.role !== roleFilter) return false;
      if (flagsOnly) {
        const diag = FourPi.diagnoseAd(ad, averages);
        if (diag.tone !== 'flag') return false;
      }
      return true;
    });
  }

  function render() {
    document.getElementById('cfg-account').value = state.account;
    document.getElementById('cfg-period').value = state.period;
    document.getElementById('cfg-result-label').value = state.resultLabel;

    const averages = FourPi.computeAverages(state.ads);
    renderSummary(averages);
    renderTable(averages);
    saveState();
  }

  function renderSummary(averages) {
    const wrap = document.getElementById('summary-cards');
    if (averages.count === 0) {
      wrap.innerHTML = '<p class="empty-state">Cargá al menos un anuncio para ver los promedios.</p>';
      return;
    }
    const resultLabel = state.resultLabel || 'Resultado';
    wrap.innerHTML = `
      <div class="summary-card">
        <div class="label">Anuncios</div>
        <div class="value">${averages.count}</div>
      </div>
      <div class="summary-card">
        <div class="label">Spend total</div>
        <div class="value">${fmtMoney(averages.totalSpend)}</div>
      </div>
      <div class="summary-card">
        <div class="label">Spend prom.</div>
        <div class="value">${fmtMoney(averages.spend)}</div>
      </div>
      <div class="summary-card">
        <div class="label">Frecuencia prom.</div>
        <div class="value">${fmtNum(averages.frequency, 2)}</div>
      </div>
      <div class="summary-card">
        <div class="label">CPM prom.</div>
        <div class="value">${fmtMoney(averages.cpm)}</div>
      </div>
      <div class="summary-card">
        <div class="label">Cost/${escapeHtml(resultLabel)} prom.</div>
        <div class="value">${fmtMoney(averages.cpr)}</div>
      </div>
    `;
  }

  function renderTable(averages) {
    const tbody = document.getElementById('ads-tbody');
    const emptyState = document.getElementById('empty-state');
    const ads = getFilteredAds();

    if (state.ads.length === 0) {
      tbody.innerHTML = '';
      emptyState.hidden = false;
      emptyState.textContent = 'Todavía no cargaste anuncios. Agregalos a mano o importá un CSV de Meta Ads Manager.';
      return;
    }
    if (ads.length === 0) {
      tbody.innerHTML = '';
      emptyState.hidden = false;
      emptyState.textContent = 'Ningún anuncio matchea el filtro actual.';
      return;
    }
    emptyState.hidden = true;

    tbody.innerHTML = ads
      .map((ad) => {
        const diag = FourPi.diagnoseAd(ad, averages);
        const c = diag.classification;
        const badgeClass = diag.tone === 'good' ? 'badge-good' : diag.tone === 'flag' ? 'badge-flag' : 'badge-neutral';
        return `
          <tr data-id="${ad.id}">
            <td>${escapeHtml(ad.name)}</td>
            <td><span class="role-chip">${FourPi.ROLE_LABELS[ad.role] || 'Sin definir'}</span></td>
            <td><span class="metric-cell">${arrowFor(c.spend)} ${fmtMoney(ad.spend)}</span></td>
            <td><span class="metric-cell">${arrowFor(c.frequency)} ${fmtNum(ad.frequency, 2)}</span></td>
            <td><span class="metric-cell">${arrowFor(c.cpm)} ${fmtMoney(ad.cpm)}</span></td>
            <td><span class="metric-cell">${arrowFor(c.cpr)} ${fmtMoney(ad.cpr)}</span></td>
            <td><span class="badge ${badgeClass}">${diag.icon} ${diag.label}</span></td>
            <td>
              <button class="btn btn-ghost btn-sm" data-action="edit" data-id="${ad.id}" type="button">Editar</button>
              <button class="btn btn-ghost btn-sm" data-action="delete" data-id="${ad.id}" type="button">Borrar</button>
            </td>
          </tr>
        `;
      })
      .join('');
  }

  function renderHelpPatterns() {
    const el = document.getElementById('help-patterns');
    el.innerHTML = FourPi.PATTERNS.map(
      (p) => `<li><strong>${p.icon} ${escapeHtml(p.label)}:</strong> ${escapeHtml(p.description)}</li>`
    ).join('');
  }

  // ---------- Modal: alta / edición de anuncio ----------

  function openAdModal(ad) {
    editingAdId = ad ? ad.id : null;
    document.getElementById('modal-ad-title').textContent = ad ? 'Editar anuncio' : 'Agregar anuncio';
    document.getElementById('ad-id').value = ad ? ad.id : '';
    document.getElementById('ad-name').value = ad ? ad.name : '';
    document.getElementById('ad-role').value = ad ? ad.role : '';
    document.getElementById('ad-spend').value = ad ? ad.spend : '';
    document.getElementById('ad-frequency').value = ad ? ad.frequency : '';
    document.getElementById('ad-cpm').value = ad ? ad.cpm : '';
    document.getElementById('ad-cpr').value = ad ? ad.cpr : '';
    document.getElementById('modal-ad').hidden = false;
  }

  function closeModal(id) {
    document.getElementById(id).hidden = true;
  }

  function handleAdFormSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('ad-id').value || uid();
    const ad = {
      id,
      name: document.getElementById('ad-name').value.trim() || 'Anuncio sin nombre',
      role: document.getElementById('ad-role').value,
      spend: parseFloat(document.getElementById('ad-spend').value),
      frequency: parseFloat(document.getElementById('ad-frequency').value),
      cpm: parseFloat(document.getElementById('ad-cpm').value),
      cpr: parseFloat(document.getElementById('ad-cpr').value),
      changes: [],
    };

    const idx = state.ads.findIndex((a) => a.id === id);
    if (idx >= 0) {
      ad.changes = state.ads[idx].changes || [];
      state.ads[idx] = ad;
      showToast('Anuncio actualizado.');
    } else {
      state.ads.push(ad);
      showToast('Anuncio agregado.');
    }
    closeModal('modal-ad');
    render();
  }

  function deleteAd(id) {
    const ad = state.ads.find((a) => a.id === id);
    if (!ad) return;
    if (!confirm(`¿Borrar el anuncio "${ad.name}"?`)) return;
    state.ads = state.ads.filter((a) => a.id !== id);
    render();
    showToast('Anuncio borrado.');
  }

  // ---------- Modal: detalle / diagnóstico ----------

  function openDetailModal(id) {
    detailAdId = id;
    renderDetailModal();
    document.getElementById('modal-detail').hidden = false;
  }

  function renderDetailModal() {
    const ad = state.ads.find((a) => a.id === detailAdId);
    if (!ad) return;
    const averages = FourPi.computeAverages(state.ads);
    const diag = FourPi.diagnoseAd(ad, averages);
    const freqRead = FourPi.readFrequency(ad, averages);
    const resultLabel = state.resultLabel || 'Resultado';

    document.getElementById('detail-title').textContent = ad.name;
    document.getElementById('detail-body').innerHTML = `
      <div class="detail-row"><span>Rol</span><strong>${FourPi.ROLE_LABELS[ad.role] || 'Sin definir'}</strong></div>
      <div class="detail-row"><span>Spend</span><strong>${fmtMoney(ad.spend)} (prom. cuenta ${fmtMoney(averages.spend)})</strong></div>
      <div class="detail-row"><span>Frecuencia</span><strong>${fmtNum(ad.frequency, 2)} (prom. cuenta ${fmtNum(averages.frequency, 2)})</strong></div>
      <div class="detail-row"><span>CPM</span><strong>${fmtMoney(ad.cpm)} (prom. cuenta ${fmtMoney(averages.cpm)})</strong></div>
      <div class="detail-row"><span>Cost/${escapeHtml(resultLabel)}</span><strong>${fmtMoney(ad.cpr)} (prom. cuenta ${fmtMoney(averages.cpr)})</strong></div>
      <div class="detail-note"><strong>${diag.icon} ${escapeHtml(diag.label)}:</strong> ${escapeHtml(diag.description)}</div>
      <div class="detail-note"><strong>Lectura de frecuencia:</strong> ${escapeHtml(freqRead.text)}</div>
    `;
    renderChangeList(ad);
  }

  function renderChangeList(ad) {
    const list = document.getElementById('change-list');
    const changes = (ad.changes || []).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
    if (changes.length === 0) {
      list.innerHTML = '<li>Sin cambios logueados en este período.</li>';
      return;
    }
    list.innerHTML = changes
      .map(
        (c) => `
        <li>
          <span>${escapeHtml(c.date)} · ${escapeHtml(c.type)}${c.note ? ' — ' + escapeHtml(c.note) : ''}</span>
          <button class="remove-change" data-change-id="${c.id}" type="button">&times;</button>
        </li>
      `
      )
      .join('');
  }

  function handleChangeFormSubmit(e) {
    e.preventDefault();
    const ad = state.ads.find((a) => a.id === detailAdId);
    if (!ad) return;
    const date = document.getElementById('change-date').value;
    if (!date) return;
    const change = {
      id: uid(),
      date,
      type: document.getElementById('change-type').value,
      note: document.getElementById('change-note').value.trim(),
    };
    ad.changes = ad.changes || [];
    ad.changes.push(change);
    document.getElementById('change-date').value = '';
    document.getElementById('change-note').value = '';
    render();
    renderDetailModal();
  }

  function removeChange(changeId) {
    const ad = state.ads.find((a) => a.id === detailAdId);
    if (!ad) return;
    ad.changes = (ad.changes || []).filter((c) => c.id !== changeId);
    render();
    renderDetailModal();
  }

  // ---------- CSV import ----------

  /**
   * Parser CSV simple (soporta comillas y comas dentro de campos citados).
   * No usa librerías externas a propósito, para mantener el módulo sin deps.
   */
  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (inQuotes) {
        if (char === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += char;
        }
      } else if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(field);
        field = '';
      } else if (char === '\n' || char === '\r') {
        if (char === '\r' && text[i + 1] === '\n') i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += char;
      }
    }
    if (field.length > 0 || row.length > 0) {
      row.push(field);
      rows.push(row);
    }
    return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
  }

  function normalizeHeader(h) {
    return h.trim().toLowerCase();
  }

  function findColumn(headers, keywords) {
    return headers.findIndex((h) => keywords.some((k) => h.includes(k)));
  }

  /**
   * Parsea un número con formato flexible: "9083.80", "9,083.80" (miles con
   * coma, decimal con punto — export en inglés) o "9.083,80" (miles con
   * punto, decimal con coma — export en español/ARS). Si aparecen los dos
   * separadores, el que queda más a la derecha es el decimal; el otro se
   * descarta como separador de miles. Si aparece uno solo, se asume decimal.
   */
  function parseNumberLoose(str) {
    if (str == null) return NaN;
    let s = String(str).replace(/[^0-9,.\-]/g, '');
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma !== -1 && lastDot !== -1) {
      if (lastComma > lastDot) {
        s = s.replace(/\./g, '').replace(',', '.');
      } else {
        s = s.replace(/,/g, '');
      }
    } else if (lastComma !== -1) {
      s = s.replace(',', '.');
    }
    return parseFloat(s);
  }

  function importCsvFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const rows = parseCsv(String(reader.result));
        if (rows.length < 2) {
          showToast('El CSV no tiene filas de datos.');
          return;
        }
        const headers = rows[0].map(normalizeHeader);
        const nameCol = findColumn(headers, ['ad name', 'anuncio', 'nombre del anuncio']);
        const spendCol = findColumn(headers, ['amount spent', 'importe gastado', 'gastado', 'spend']);
        const freqCol = findColumn(headers, ['frequency', 'frecuencia']);
        const cpmCol = findColumn(headers, ['cpm']);
        const cprCol = findColumn(headers, ['cost per result', 'costo por resultado', 'cost/result']);

        if (nameCol === -1 || spendCol === -1 || freqCol === -1 || cpmCol === -1 || cprCol === -1) {
          showToast('No pude reconocer todas las columnas necesarias (nombre, spend, frecuencia, CPM, costo por resultado) en el CSV.');
          return;
        }

        let imported = 0;
        for (let i = 1; i < rows.length; i++) {
          const r = rows[i];
          const name = (r[nameCol] || '').trim();
          if (!name) continue;
          state.ads.push({
            id: uid(),
            name,
            role: '',
            spend: parseNumberLoose(r[spendCol]),
            frequency: parseNumberLoose(r[freqCol]),
            cpm: parseNumberLoose(r[cpmCol]),
            cpr: parseNumberLoose(r[cprCol]),
            changes: [],
          });
          imported++;
        }
        render();
        showToast(`Se importaron ${imported} anuncios. Asigná el rol de funnel de cada uno.`);
      } catch (err) {
        console.error(err);
        showToast('No se pudo leer el CSV. Revisá el formato.');
      }
    };
    reader.readAsText(file);
  }

  // ---------- Backup JSON ----------

  function exportJson() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeAccount = (state.account || 'cuenta').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    a.href = url;
    a.download = `4pi-dashboard-${safeAccount}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function importJsonFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        state = { ...defaultState(), ...parsed, ads: Array.isArray(parsed.ads) ? parsed.ads : [] };
        render();
        showToast('Datos importados.');
      } catch (err) {
        console.error(err);
        showToast('El archivo no es un JSON válido de este dashboard.');
      }
    };
    reader.readAsText(file);
  }

  // ---------- Eventos ----------

  function bindEvents() {
    document.getElementById('cfg-account').addEventListener('input', (e) => {
      state.account = e.target.value;
      saveState();
    });
    document.getElementById('cfg-period').addEventListener('input', (e) => {
      state.period = e.target.value;
      saveState();
    });
    document.getElementById('cfg-result-label').addEventListener('input', (e) => {
      state.resultLabel = e.target.value;
      render();
    });

    document.getElementById('filter-role').addEventListener('change', () => renderTable(FourPi.computeAverages(state.ads)));
    document.getElementById('filter-flags').addEventListener('change', () => renderTable(FourPi.computeAverages(state.ads)));

    document.getElementById('btn-add-ad').addEventListener('click', () => openAdModal(null));
    document.getElementById('form-ad').addEventListener('submit', handleAdFormSubmit);

    document.getElementById('ads-tbody').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (btn) {
        const id = btn.dataset.id;
        if (btn.dataset.action === 'edit') openAdModal(state.ads.find((a) => a.id === id));
        if (btn.dataset.action === 'delete') deleteAd(id);
        return;
      }
      const row = e.target.closest('tr[data-id]');
      if (row) openDetailModal(row.dataset.id);
    });

    document.querySelectorAll('[data-close-modal]').forEach((btn) => {
      btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
    });
    document.querySelectorAll('.modal-overlay').forEach((overlay) => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.hidden = true;
      });
    });

    document.getElementById('form-change').addEventListener('submit', handleChangeFormSubmit);
    document.getElementById('change-list').addEventListener('click', (e) => {
      const btn = e.target.closest('.remove-change');
      if (btn) removeChange(btn.dataset.changeId);
    });

    document.getElementById('btn-help').addEventListener('click', () => {
      renderHelpPatterns();
      document.getElementById('modal-help').hidden = false;
    });

    document.getElementById('btn-import-csv').addEventListener('click', () => document.getElementById('input-csv').click());
    document.getElementById('input-csv').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) importCsvFile(file);
      e.target.value = '';
    });

    document.getElementById('btn-export-json').addEventListener('click', exportJson);
    document.getElementById('btn-import-json').addEventListener('click', () => document.getElementById('input-json').click());
    document.getElementById('input-json').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) importJsonFile(file);
      e.target.value = '';
    });

    document.getElementById('btn-clear-all').addEventListener('click', () => {
      if (!confirm('Esto borra todos los anuncios y la configuración de este dashboard. ¿Seguro?')) return;
      state = defaultState();
      render();
      showToast('Se vació el dashboard.');
    });
  }

  // ---------- Init ----------

  document.addEventListener('DOMContentLoaded', () => {
    bindEvents();
    render();
  });
})();
