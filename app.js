/* =========================================================
   APP.JS - النسخة النهائية v8.1
   تم إصلاح 7 مشاكل من المراجعة
   ========================================================= */

// ============================================
// الجزء 1: STATE + UTILS + MONTHS
// ============================================

// STATE MANAGEMENT
let state = { 
  checks: [], 
  currentCheckId: null,
  currentPage: 'checks',
  transfers: { transactions: [], purchases: [] }
};

const uid = () => 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2,8);

const loadState = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state.checks = parsed.checks || [];
      state.currentCheckId = parsed.currentCheckId || null;
      state.currentPage = parsed.currentPage || 'checks';
      state.transfers = parsed.transfers || { transactions: [], purchases: [] };
    }
  } catch(e) { console.error('Error loading state:', e); }
};

let saveTimeout = null;
const saveState = () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  showSaveIndicator();
};

const showSaveIndicator = () => {
  const el = document.getElementById('save-indicator');
  el.classList.add('show');
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => el.classList.remove('show'), 1200);
};

let renderTimeout = null;
// ✅ إصلاح #4: استخدام renderAll بدل renderSidebar + renderReportView
const scheduleRender = () => {
  clearTimeout(renderTimeout);
  renderTimeout = setTimeout(() => {
    if (state.currentPage === 'checks') {
      renderAll();  // ← يشمل Edit Form كمان
    } else {
      renderTransfersPage();
    }
  }, APP_CONFIG.AUTO_SAVE_DELAY);
};

// UTILITY FUNCTIONS
const round2 = (n) => {
  const num = Number(n);
  if (isNaN(num)) return 0;
  return Math.round(num * 100) / 100;
};

const parseNum = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return round2(v);
  const s = String(v).replace(/,/g, '').replace(/[^\d.-]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : round2(n);
};

const fmt = (n) => {
  if (n === null || n === undefined || isNaN(n)) n = 0;
  return Number(n).toLocaleString(APP_CONFIG.LOCALE, { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  });
};

const esc = (s) => {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
};

// MONTHS
const workMonthKey = (d) => d.year + '-' + String(d.month).padStart(2,'0');
const workMonthLabel = (key) => {
  if (!key) return '';
  const [y,m] = key.split('-');
  return MONTHS_AR[parseInt(m)-1] + ' ' + y;
};
const workMonthOptions = () => {
  const now = new Date();
  const year = now.getFullYear();
  const opts = [];
  for (let y = year - 1; y <= year + 1; y++) {
    for (let m = 1; m <= 12; m++) {
      const key = workMonthKey({year:y, month:m});
      opts.push({ key, label: workMonthLabel(key) });
    }
  }
  return opts;
};

// ✅ إصلاح #3: استخدام string split بدل Date object لتجنب مشاكل Timezone
const getMonthFromDate = (dateStr) => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length < 2) return '';
  return parts[0] + '-' + parts[1];
};

// ============================================
// الجزء 2: CHECKS CALCULATION + CRUD
// ============================================

const Calc = {
  supply: (a) => (a && a > 0) ? round2(a / TAX.VAT_DIVISOR) : 0,
  check13: (s) => round2(s * TAX.VAT_RATE),
  check1: (s) => round2(s * TAX.DEDUCTION_RATE),
  buyer14: (s) => round2(s * TAX.BUYER_RATE),
  supplyOrdersTotal: (o) => round2((o || []).reduce((s,x) => s + parseNum(x.supplyValue), 0)),
  actualPurchaseTotal: (o) => round2((o || []).reduce((s,x) => s + parseNum(x.actualPurchase), 0)),
  expensesTotal: (e) => round2((e || []).reduce((s,x) => s + parseNum(x.value), 0)),
  taxableProfit: (s, p) => round2(Math.max(0, s - p)),
  tax225: (p) => round2(p * TAX.TAX_RATE),
  remaining225: (t, c) => round2(Math.max(0, t - c)),
  buyerNet: (s, v) => round2(Calc.buyer14(s) - (v || 0)),
  actualProfit: (s, a, e, t) => round2(s - a - e - t),
  profitShare: (n, p) => round2(n * (p / 100))
};

const computeCheck = (chk) => {
  const checkAmount = parseNum(chk.checkAmount);
  const supply = Calc.supply(checkAmount);
  const pct13 = Calc.check13(supply);
  const pct1 = Calc.check1(supply);
  const vat = parseNum(chk.vat);
  const taxablePurchase = parseNum(chk.taxablePurchase);
  const supplyTotal = Calc.supplyOrdersTotal(chk.supplyOrders);
  const actualTotal = Calc.actualPurchaseTotal(chk.supplyOrders);
  const expensesTotal = Calc.expensesTotal(chk.expenses);
  const taxProfit = Calc.taxableProfit(supply, taxablePurchase);
  const tax225 = Calc.tax225(taxProfit);
  const remaining225 = Calc.remaining225(tax225, pct1);
  const buyer14 = Calc.buyer14(supply);
  const buyerNet = Calc.buyerNet(supply, vat);
  const actualProfit = Calc.actualProfit(supply, actualTotal, expensesTotal, tax225);
  const moazPct = parseNum(chk.splitMoaz) || TAX.DEFAULT_SPLIT;
  const amrPct = parseNum(chk.splitAmr) || TAX.DEFAULT_SPLIT;
  const moazProfitShare = Calc.profitShare(actualProfit, moazPct);
  const amrProfitShare = Calc.profitShare(actualProfit, amrPct);

  const supplyDifference = Math.abs(supply - supplyTotal);
  const supplyMatch = supply > 0 && supplyTotal > 0 && Math.abs(supply - supplyTotal) < 0.01;

  return {
    checkAmount, supply, pct13, pct1, vat, taxablePurchase,
    supplyTotal, actualTotal, expensesTotal, taxProfit, tax225,
    remaining225, buyer14, buyerNet, actualProfit,
    moazPct, amrPct, moazProfitShare, amrProfitShare,
    moazTotal: round2(moazProfitShare + remaining225),
    amrTotal: amrProfitShare,
    supplyDifference, supplyMatch
  };
};

const isLocked = (chk) => !!chk.collectionDate;

const createNewCheck = () => {
  const now = new Date();
  const chk = {
    id: uid(),
    workMonth: workMonthKey({ year: now.getFullYear(), month: now.getMonth()+1 }),
    checkNumber: '', checkAmount: '', checkDate: '',
    received: false, collectionDate: '',
    supplyOrders: [], taxablePurchase: '', vat: '', expenses: [],
    splitMoaz: TAX.DEFAULT_SPLIT, splitAmr: TAX.DEFAULT_SPLIT, 
    createdAt: Date.now()
  };
  state.checks.push(chk);
  state.currentCheckId = chk.id;
  saveState();
  renderAll();
};

const deleteCurrentCheck = () => {
  if (!state.currentCheckId) return;
  if (!confirm('هل أنت متأكد من حذف هذا الشيك؟')) return;
  state.checks = state.checks.filter(c => c.id !== state.currentCheckId);
  state.currentCheckId = state.checks.length ? state.checks[0].id : null;
  saveState();
  renderAll();
};

const getCurrentCheck = () => state.checks.find(c => c.id === state.currentCheckId) || null;
const selectCheck = (id) => { 
  state.currentCheckId = id; 
  saveState(); 
  renderAll(); 
};

const switchTab = (tabName) => {
  document.querySelectorAll('#page-checks .tab').forEach(t => 
    t.classList.toggle('active', t.dataset.tab === tabName)
  );
  document.querySelectorAll('#page-checks .tab-content').forEach(t => 
    t.classList.toggle('active', t.id === 'tab-' + tabName)
  );
};

const getStatus = (chk) => {
  if (chk.collectionDate) return CHECK_STATUS.COLLECTED;
  if (chk.received) return CHECK_STATUS.RECEIVED;
  return CHECK_STATUS.NONE;
};

// ============================================
// الجزء 3: CHECKS RENDERING (Sidebar + Edit Form)
// ============================================

const renderSidebar = () => {
  const monthFilter = document.getElementById('month-filter');
  const currentFilter = monthFilter.value;
  const months = [...new Set(state.checks.map(c => c.workMonth).filter(Boolean))].sort();
  monthFilter.innerHTML = '<option value="">— كل الشهور —</option>' +
    months.map(m => `<option value="${m}" ${m===currentFilter?'selected':''}>${workMonthLabel(m)}</option>`).join('');

  const list = document.getElementById('checks-list');
  const filter = monthFilter.value;
  const filtered = state.checks
    .filter(c => !filter || c.workMonth === filter)
    .sort((a,b) => (a.workMonth||'').localeCompare(b.workMonth||'') || a.createdAt - b.createdAt);

  list.innerHTML = filtered.length === 0
    ? '<div style="color:#94a3b8; font-size:11px; padding:10px; text-align:center;">لا توجد شيكات</div>'
    : filtered.map(c => {
        const comp = computeCheck(c);
        const st = getStatus(c);
        const active = c.id === state.currentCheckId ? 'active' : '';
        const num = c.checkNumber || '(بدون رقم)';
        return `<div class="check-item ${active}" onclick="selectCheck('${c.id}')">
          <div class="ci-top">
            <span class="ci-num">#${esc(num)}</span>
            <span class="ci-status ${st.cls}">${st.text}</span>
          </div>
          <div class="ci-meta">${workMonthLabel(c.workMonth)}</div>
          <div class="ci-amount">${comp.checkAmount ? fmt(comp.checkAmount) + ' ' + APP_CONFIG.CURRENCY : '—'}</div>
        </div>`;
      }).join('');

  const allC = state.checks.map(c => computeCheck(c));
  const totalCount = state.checks.length;
  const totalAmount = allC.reduce((s,c)=>s+c.checkAmount,0);
  const cumulativeTax225 = allC.reduce((s,c)=>s+c.tax225,0);
  const cumulative1pct = allC.reduce((s,c)=>s+c.pct1,0);
  const cumulativeRemaining = round2(Math.max(0, cumulativeTax225 - cumulative1pct));

  document.getElementById('kpi-count').textContent = totalCount;
  document.getElementById('kpi-total').textContent = fmt(totalAmount);
  document.getElementById('kpi-tax225').textContent = fmt(cumulativeTax225);
  document.getElementById('kpi-onepct').textContent = fmt(cumulative1pct);
  document.getElementById('kpi-remaining225').textContent = fmt(cumulativeRemaining);
};

const infoRow = (lbl, val, cls='') => `<div class="info-row"><span class="lbl">${lbl}</span><span class="val ${cls}">${val}</span></div>`;
const computedField = (label, value, cls='') => `<div class="field"><label>${label}</label><div class="computed ${cls}">${value}</div></div>`;
const moneyField = (id, label, value, placeholder='0.00') => `<div class="field"><label>${label}</label><input type="text" id="${id}" value="${value > 0 ? fmt(value) : ''}" inputmode="decimal" placeholder="${placeholder}" class="num money-input"></div>`;

const buildReconWarning = (c) => {
  if (c.supply <= 0 || c.supplyTotal <= 0) return '';
  if (c.supplyMatch) {
    return `<div class="recon-ok"><span class="icon">✅</span><span class="text">قيمة التوريد متطابقة — ${fmt(c.supply)}</span></div>`;
  } else {
    const diff = c.supplyDifference;
    const higher = c.supply > c.supplyTotal ? 'الشيك' : 'أوامر التوريد';
    return `<div class="recon-warning">
      <span class="icon">⚠️</span>
      <div class="content">
        <div class="title">يوجد فرق في قيمة التوريد</div>
        <div class="details">
          قيمة التوريد حسب الشيك: <span>${fmt(c.supply)}</span><br>
          إجمالي أوامر التوريد: <span>${fmt(c.supplyTotal)}</span><br>
          الفرق: <span>${fmt(diff)}</span> — الأعلى: ${higher}
        </div>
      </div>
    </div>`;
  }
};

const renderEditForm = () => {
  const chk = getCurrentCheck();
  const empty = document.getElementById('empty-state');
  const container = document.getElementById('report-container');
  if (!chk) {
    empty.style.display = 'block';
    container.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  container.style.display = 'block';

  const num = chk.checkNumber || '—';
  document.getElementById('report-title').textContent = `تقرير الشيك #${num}`;

  const c = computeCheck(chk);
  const locked = isLocked(chk);
  const form = document.getElementById('edit-form');

  const totalSplit = round2(c.moazPct + c.amrPct);
  const isValidSplit = Math.abs(totalSplit - 100) < 0.01;
  const splitWarning = !isValidSplit 
    ? `<div class="recon-warning" style="margin-top:10px;">
         <span class="icon">⚠️</span>
         <div class="content">
           <div class="title">تنبيه: مجموع نسب التقسيم لا يساوي 100%</div>
           <div class="details">المجموع الحالي: <span>${totalSplit}%</span> (يجب أن يكون 100%)</div>
         </div>
       </div>` 
    : '';

  const lockBanner = locked 
    ? `<div class="lock-banner">
         <span style="font-size:24px;">🔒</span>
         <div class="content">
           <div class="title">هذا الشيك مقفل</div>
           <div class="details">تم قفل التعديلات تلقائياً لوجود "تاريخ تحصيل فعلي".</div>
         </div>
         <button onclick="unlockCheck()">🔓 فتح للتعديل</button>
       </div>`
    : '';

  const dis = locked ? 'disabled' : '';

  form.innerHTML = `
  ${lockBanner}
  <div class="edit-section">
    <h3>بيانات الشيك</h3>
    <div class="field-grid">
      <div class="field">
        <label>شهر العمل</label>
        <select id="f-work-month" ${dis}>
          ${workMonthOptions().map(o => `<option value="${o.key}" ${o.key===chk.workMonth?'selected':''}>${o.label}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>رقم الشيك</label>
        <input type="text" id="f-check-number" value="${esc(chk.checkNumber)}" placeholder="مثال: 1258" inputmode="numeric" ${dis}>
      </div>
      ${moneyField('f-check-amount', 'مبلغ الشيك الكامل', c.checkAmount)}
      <div class="field">
        <label>تاريخ صرف الشيك (المكتوب عليه)</label>
        <input type="date" id="f-check-date" value="${chk.checkDate || ''}" ${dis}>
      </div>
      ${computedField('قيمة التوريد حسب الشيك (محسوبة ÷ 1.13)', fmt(c.supply), 'highlight')}
      ${computedField('قيمة 13% (محسوبة)', fmt(c.pct13), 'highlight')}
      ${computedField('قيمة 1% (محسوبة)', fmt(c.pct1), 'highlight')}
    </div>
    <div class="field-grid" style="margin-top:10px;">
      <div class="checkbox-field">
        <input type="checkbox" id="f-received" ${chk.received?'checked':''} ${dis}>
        <label for="f-received">✓ تم استلام الشيك</label>
      </div>
      <div class="field">
        <label>تاريخ التحصيل الفعلي (يؤدي لقفل الشيك)</label>
        <input type="date" id="f-collection-date" value="${chk.collectionDate || ''}">
      </div>
    </div>
  </div>

  <div class="edit-section">
    <h3>أوامر التوريد</h3>
    ${buildReconWarning(c)}
    <table class="edit-table" id="tbl-supply-orders">
      <thead>
        <tr>
          <th style="width:30%;">رقم أمر التوريد</th>
          <th style="width:25%;">قيمة التوريد</th>
          <th style="width:25%;">الشراء الفعلي</th>
          <th style="width:20%;" class="no-print">إجراءات</th>
        </tr>
      </thead>
      <tbody>
        ${(chk.supplyOrders||[]).map((o,i) => {
          const sv = parseNum(o.supplyValue);
          const ap = parseNum(o.actualPurchase);
          return `<tr>
            <td><input type="text" value="${esc(o.orderNumber||'')}" onchange="updateSupplyOrder(${i},'orderNumber',this.value)" placeholder="رقم الأمر" ${dis}></td>
            <td><input type="text" class="num money-cell" inputmode="decimal" value="${sv > 0 ? fmt(sv) : ''}" onfocus="onMoneyFocus(this)" onblur="onMoneyBlur(this, ${i}, 'supplyValue')" placeholder="0.00" ${dis}></td>
            <td><input type="text" class="num money-cell" inputmode="decimal" value="${ap > 0 ? fmt(ap) : ''}" onfocus="onMoneyFocus(this)" onblur="onMoneyBlur(this, ${i}, 'actualPurchase')" placeholder="0.00" ${dis}></td>
            <td class="no-print"><div class="row-actions"><button class="del" data-action="del-supply" data-idx="${i}" ${dis}>حذف</button></div></td>
          </tr>`;
        }).join('') || '<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:12px;">لا توجد أوامر توريد</td></tr>'}
      </tbody>
      <tfoot>
        <tr class="total-row">
          <td colspan="2">إجمالي أوامر التوريد</td>
          <td class="num">${fmt(c.supplyTotal)}</td>
          <td class="num">${fmt(c.actualTotal)}</td>
        </tr>
      </tfoot>
    </table>
    <button class="add-row-btn no-print" onclick="addSupplyOrder()" ${dis}>➕ إضافة أمر توريد</button>
  </div>

  <div class="edit-section">
    <h3>الشراء الضريبي</h3>
    <div class="field-grid">
      ${moneyField('f-taxable-purchase', 'إجمالي الشراء الضريبي (يدوي)', c.taxablePurchase)}
    </div>
  </div>

  <div class="edit-section">
    <h3>القيمة المضافة VAT</h3>
    <div class="field-grid">
      ${moneyField('f-vat', 'القيمة المضافة المدفوعة مقدمًا (يدوي)', c.vat)}
    </div>
  </div>

  <div class="edit-section">
    <h3 class="buyer">حساب ${PARTNERS.BUYER_COMPANY} — ${PARTNERS.BUYER_NAME}</h3>
    <div class="field-grid">
      ${computedField('مستحق ' + PARTNERS.BUYER_NAME + ' 14% (محسوب)', fmt(c.buyer14))}
      ${computedField('مغطى من 13% (للتوضيح)', fmt(c.pct13))}
      ${computedField('مغطى من 1% (للتوضيح)', fmt(c.pct1))}
      ${computedField('VAT مدفوع مقدمًا (خصم)', fmt(c.vat))}
    </div>
    <div style="margin-top:12px;">
      <div class="field">
        <label style="font-size:13px; color:#1e3a8a; font-weight:700; margin-bottom:5px;">صافي حساب ${PARTNERS.BUYER_NAME} (14% − VAT)</label>
        <div class="computed big">${fmt(c.buyerNet)}</div>
      </div>
    </div>
  </div>

  <div class="edit-section">
    <h3>المصاريف</h3>
    <table class="edit-table" id="tbl-expenses">
      <thead>
        <tr>
          <th style="width:60%;">بند المصروف</th>
          <th style="width:25%;">القيمة</th>
          <th style="width:15%;" class="no-print">إجراءات</th>
        </tr>
      </thead>
      <tbody>
        ${(chk.expenses||[]).map((e,i) => {
          const v = parseNum(e.value);
          return `<tr>
            <td><input type="text" value="${esc(e.label||'')}" onchange="updateExpense(${i},'label',this.value)" placeholder="اسم البند" ${dis}></td>
            <td><input type="text" class="num money-cell" inputmode="decimal" value="${v > 0 ? fmt(v) : ''}" onfocus="onMoneyFocus(this)" onblur="onMoneyBlur(this, ${i}, 'value')" placeholder="0.00" ${dis}></td>
            <td class="no-print"><div class="row-actions"><button class="del" data-action="del-expense" data-idx="${i}" ${dis}>حذف</button></div></td>
          </tr>`;
        }).join('') || '<tr><td colspan="3" style="text-align:center;color:#94a3b8;padding:12px;">لا توجد مصاريف</td></tr>'}
      </tbody>
      <tfoot>
        <tr class="total-row">
          <td>إجمالي المصاريف</td>
          <td class="num">${fmt(c.expensesTotal)}</td>
          <td class="no-print"></td>
        </tr>
      </tfoot>
    </table>
    <button class="add-row-btn no-print" onclick="addExpense()" ${dis}>➕ إضافة مصروف</button>
  </div>

  <div class="edit-section">
    <h3 class="tax">الضريبة</h3>
    <div class="field-grid">
      ${computedField('قيمة التوريد', fmt(c.supply))}
      ${computedField('الشراء الضريبي', fmt(c.taxablePurchase))}
      ${computedField('الربح الضريبي (محسوب)', fmt(c.taxProfit))}
      ${computedField('ضريبة 22.5% (محسوبة)', fmt(c.tax225), 'tax-val')}
    </div>
  </div>

  <div class="edit-section">
    <h3 class="tax">تفصيل المتبقي من 22.5%</h3>
    <div class="field-grid">
      ${computedField('إجمالي 22.5%', fmt(c.tax225), 'tax-val')}
      ${computedField('1% المستخدم في تسوية شركة المشتريات', fmt(c.pct1))}
      ${computedField('المتبقي من 22.5% (22.5% − 1%)', fmt(c.remaining225), 'tax-val')}
    </div>
  </div>

  <div class="edit-section">
    <h3 class="profit">الربح الفعلي</h3>
    <div class="field-grid">
      ${computedField('إجمالي التوريد', fmt(c.supply))}
      ${computedField('إجمالي الشراء الفعلي', fmt(c.actualTotal))}
      ${computedField('إجمالي المصاريف', fmt(c.expensesTotal))}
      ${computedField('ضريبة 22.5% كاملة', fmt(c.tax225), 'tax-val')}
      <div class="field" style="grid-column: span 2;">
        <label>صافي الربح الفعلي</label>
        <div class="computed profit-val">${fmt(c.actualProfit)}</div>
      </div>
    </div>
  </div>

  <div class="edit-section">
    <h3 class="profit">تقسيم صافي الربح</h3>
    ${splitWarning}
    <table class="edit-table profit-split-table" style="margin-top:10px;">
      <thead>
        <tr>
          <th>الشخص</th>
          <th style="width:15%;">النسبة %</th>
          <th style="width:25%;">نصيب الربح</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${PARTNERS.PARTNER_1}</td>
          <td><input type="number" class="split-input" id="split-moaz" value="${chk.splitMoaz || TAX.DEFAULT_SPLIT}" min="0" max="100" step="0.01" ${dis}></td>
          <td class="num-cell">${fmt(c.moazProfitShare)}</td>
        </tr>
        <tr>
          <td>${PARTNERS.PARTNER_2}</td>
          <td><input type="number" class="split-input" id="split-amr" value="${chk.splitAmr || TAX.DEFAULT_SPLIT}" min="0" max="100" step="0.01" ${dis}></td>
          <td class="num-cell">${fmt(c.amrProfitShare)}</td>
        </tr>
        <tr class="total-row">
          <td>المجموع</td>
          <td>${totalSplit}%</td>
          <td class="num-cell">${fmt(c.moazProfitShare+c.amrProfitShare)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="edit-section">
    <h3 class="settle">التسوية النهائية</h3>
    <div class="field-grid">
      ${computedField('حساب ' + PARTNERS.PARTNER_1 + ' (نصيب الربح + المتبقي من 22.5%)', fmt(c.moazTotal), 'profit-val')}
      ${computedField('حساب ' + PARTNERS.PARTNER_2 + ' (نصيب الربح فقط)', fmt(c.amrTotal), 'profit-val')}
    </div>
  </div>
  `;

  if (!locked) {
    document.getElementById('f-work-month').addEventListener('change', e => updateField('workMonth', e.target.value));
    document.getElementById('f-check-number').addEventListener('change', e => updateField('checkNumber', e.target.value));
    document.getElementById('f-check-date').addEventListener('change', e => updateField('checkDate', e.target.value));
    document.getElementById('f-received').addEventListener('change', e => updateField('received', e.target.checked));
    document.getElementById('f-collection-date').addEventListener('change', e => {
      updateField('collectionDate', e.target.value);
      if (e.target.value) renderEditForm(); 
    });
    document.getElementById('split-moaz').addEventListener('change', e => updateField('splitMoaz', e.target.value));
    document.getElementById('split-amr').addEventListener('change', e => updateField('splitAmr', e.target.value));

    bindMoneyInput('f-check-amount', 'checkAmount');
    bindMoneyInput('f-taxable-purchase', 'taxablePurchase');
    bindMoneyInput('f-vat', 'vat');
  }

  // ✅ إصلاح #1: استخدام onclick بدل addEventListener لمنع التراكم
  form.onclick = (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn || btn.disabled) return;
    const action = btn.dataset.action;
    const idx = parseInt(btn.dataset.idx);
    if (action === 'del-supply') deleteSupplyOrder(idx);
    if (action === 'del-expense') deleteExpense(idx);
  };
};

// ============================================
// الجزء 4: UPDATE HANDLERS + REPORT VIEW
// ============================================

const unlockCheck = () => {
  if (!confirm('هل أنت متأكد من فتح هذا الشيك للتعديل؟ سيتم مسح تاريخ التحصيل الفعلي.')) return;
  const chk = getCurrentCheck();
  if (chk) {
    chk.collectionDate = '';
    saveState();
    renderAll();
  }
};

const bindMoneyInput = (id, field) => {
  const input = document.getElementById(id);
  if (!input) return;
  input.addEventListener('focus', () => {
    const raw = parseNum(input.value);
    if (raw > 0) input.value = raw;
  });
  input.addEventListener('blur', () => {
    const chk = getCurrentCheck();
    if (!chk) return;
    const raw = parseNum(input.value);
    chk[field] = raw > 0 ? raw : '';
    if (raw > 0) input.value = fmt(raw);
    else input.value = '';
    saveState();
    scheduleRender();
  });
};

const updateField = (field, value) => {
  const chk = getCurrentCheck();
  if (!chk) return;
  chk[field] = value;
  saveState();
  scheduleRender();
};

const onMoneyFocus = (input) => {
  const raw = parseNum(input.value);
  input.value = raw > 0 ? raw : '';
};

const onMoneyBlur = (input, idx, field) => {
  const raw = parseNum(input.value);
  const value = raw > 0 ? raw : '';
  input.value = raw > 0 ? fmt(raw) : '';

  if (field === 'supplyValue' || field === 'actualPurchase') {
    updateSupplyOrder(idx, field, value);
  } else if (field === 'value') {
    updateExpense(idx, field, value);
  }
};

const addSupplyOrder = () => {
  const chk = getCurrentCheck();
  if (!chk) return;
  if (!chk.supplyOrders) chk.supplyOrders = [];
  chk.supplyOrders.push({ orderNumber: '', supplyValue: '', actualPurchase: '' });
  saveState();
  renderEditForm();
};

const updateSupplyOrder = (idx, field, value) => {
  const chk = getCurrentCheck();
  if (!chk || !chk.supplyOrders[idx]) return;
  chk.supplyOrders[idx][field] = value;
  saveState();
  scheduleRender();
};

const deleteSupplyOrder = (idx) => {
  const chk = getCurrentCheck();
  if (!chk) return;
  chk.supplyOrders.splice(idx, 1);
  saveState();
  renderEditForm();
};

const addExpense = () => {
  const chk = getCurrentCheck();
  if (!chk) return;
  if (!chk.expenses) chk.expenses = [];
  chk.expenses.push({ label: '', value: '' });
  saveState();
  renderEditForm();
};

const updateExpense = (idx, field, value) => {
  const chk = getCurrentCheck();
  if (!chk || !chk.expenses[idx]) return;
  chk.expenses[idx][field] = value;
  saveState();
  scheduleRender();
};

const deleteExpense = (idx) => {
  const chk = getCurrentCheck();
  if (!chk) return;
  chk.expenses.splice(idx, 1);
  saveState();
  renderEditForm();
};

const renderReportView = () => {
  const chk = getCurrentCheck();
  if (!chk) return;
  const c = computeCheck(chk);
  const num = chk.checkNumber || '—';
  const reportNum = `CHK-${chk.workMonth}-${chk.checkNumber || '001'}`;
  const totalSplit = round2(c.moazPct + c.amrPct);
  const isValidSplit = Math.abs(totalSplit - 100) < 0.01;

  document.getElementById('report-view').innerHTML = `
  <div class="rpt-header">
    <div class="rpt-header-left">
      <div class="lbl">تقرير رقم</div>
      <div class="val">${reportNum}</div>
    </div>
    <div class="rpt-header-right">
      <h1>تقرير تسوية شيك</h1>
      <div class="rpt-sub">
        <strong>شهر العمل:</strong> ${workMonthLabel(chk.workMonth)} &nbsp;|&nbsp;
        <strong>رقم الشيك:</strong> ${esc(num)}
      </div>
    </div>
    <div class="rpt-header-logo">شعار الشركة<br>(اختياري)</div>
  </div>

  <div class="rpt-section">
    <div class="rpt-section-title">بيانات الشيك</div>
    <div class="rpt-body">
      <div class="info-grid">
        ${infoRow('شهر العمل:', workMonthLabel(chk.workMonth))}
        ${infoRow('قيمة التوريد حسب الشيك:', fmt(c.supply), 'big')}
        ${infoRow('تم استلام الشيك:', chk.received ? '✅ نعم' : '❌ لا', 'green')}
        ${infoRow('رقم الشيك:', esc(num), 'big')}
        ${infoRow('قيمة 13%:', fmt(c.pct13))}
        ${infoRow('تاريخ صرف الشيك:', chk.checkDate || '—')}
        ${infoRow('مبلغ الشيك الكامل:', fmt(c.checkAmount), 'big')}
        ${infoRow('قيمة 1%:', fmt(c.pct1))}
        ${infoRow('تاريخ التحصيل الفعلي:', chk.collectionDate || '—')}
      </div>
    </div>
  </div>

  <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-bottom:14px;">
    <div class="rpt-section" style="margin-bottom:0;">
      <div class="rpt-section-title alt">أوامر التوريد</div>
      <div class="rpt-body" style="padding:0;">
        ${buildReconWarning(c)}
        <table class="rpt-table">
          <thead><tr><th>م</th><th>رقم أمر التوريد</th><th>قيمة التوريد</th><th>الشراء الفعلي</th></tr></thead>
          <tbody>
            ${(chk.supplyOrders||[]).map((o,i) => `
              <tr>
                <td>${i+1}</td>
                <td>${esc(o.orderNumber||'—')}</td>
                <td class="num">${fmt(parseNum(o.supplyValue))}</td>
                <td class="num">${fmt(parseNum(o.actualPurchase))}</td>
              </tr>
            `).join('') || '<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:10px;">لا توجد أوامر توريد</td></tr>'}
          </tbody>
          <tfoot>
            <tr class="total-row">
              <td colspan="2">الإجمالي</td>
              <td class="num">${fmt(c.supplyTotal)}</td>
              <td class="num">${fmt(c.actualTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>

    <div>
      <div class="rpt-section" style="margin-bottom:12px;">
        <div class="rpt-section-title alt">الشراء الضريبي والقيمة المضافة</div>
        <div class="rpt-body">
          ${infoRow('إجمالي الشراء الضريبي:', fmt(c.taxablePurchase), 'big')}
          ${infoRow('القيمة المضافة المدفوعة مقدمًا (VAT):', fmt(c.vat), 'big')}
        </div>
      </div>

      <div class="rpt-section" style="margin-bottom:0;">
        <div class="rpt-section-title">حساب ${PARTNERS.BUYER_COMPANY} - ${PARTNERS.BUYER_NAME}</div>
        <div class="rpt-body">
          ${infoRow('مستحق 14% من التوريد:', fmt(c.buyer14))}
          ${infoRow('مغطى من 13% (معلومات):', fmt(c.pct13))}
          ${infoRow('مغطى من 1% (معلومات):', fmt(c.pct1))}
          ${infoRow('القيمة المضافة المدفوعة مقدمًا (خصم):', fmt(c.vat), 'red')}
          <div class="big-result">
            <span class="lbl">صافي مستحق ${PARTNERS.BUYER_NAME}</span>
            <span class="val">${fmt(c.buyerNet)}</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="rpt-section">
    <div class="rpt-section-title orange">المصاريف</div>
    <div class="rpt-body" style="padding:0;">
      <table class="rpt-table">
        <thead><tr><th>م</th><th>البند</th><th>القيمة</th></tr></thead>
        <tbody>
          ${(chk.expenses||[]).map((e,i) => `
            <tr>
              <td>${i+1}</td>
              <td>${esc(e.label||'—')}</td>
              <td class="num">${fmt(parseNum(e.value))}</td>
            </tr>
          `).join('') || '<tr><td colspan="3" style="text-align:center;color:#94a3b8;padding:10px;">لا توجد مصاريف</td></tr>'}
        </tbody>
        <tfoot>
          <tr class="total-row">
            <td colspan="2">إجمالي المصاريف</td>
            <td class="num">${fmt(c.expensesTotal)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>

  <div class="rpt-section">
    <div class="rpt-section-title">ضريبة 22.5%</div>
    <div class="rpt-body">
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
        <div>
          ${infoRow('قيمة التوريد:', fmt(c.supply))}
          ${infoRow('إجمالي الشراء الضريبي:', fmt(c.taxablePurchase))}
          <div class="info-row" style="border-top:2px solid #1e3a5f; padding-top:6px; margin-top:3px;">
            <span class="lbl" style="font-weight:800;">الربح الضريبي:</span>
            <span class="val big">${fmt(c.taxProfit)}</span>
          </div>
          ${infoRow('ضريبة 22.5%:', fmt(c.tax225), 'big red')}
        </div>
        <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:6px; text-align:center;">
          <div style="background:#fee2e2; padding:10px 6px; border-radius:5px; border:1px solid #fca5a5;">
            <div style="font-size:10px; color:#7f1d1d; font-weight:600;">إجمالي ضريبة 22.5%</div>
            <div style="font-size:16px; font-weight:800; color:#7f1d1d; direction:ltr; margin-top:3px;">${fmt(c.tax225)}</div>
          </div>
          <div style="background:#fef3c7; padding:10px 6px; border-radius:5px; border:1px solid #fcd34d;">
            <div style="font-size:10px; color:#78350f; font-weight:600;">1% لشركة المشتريات</div>
            <div style="font-size:16px; font-weight:800; color:#78350f; direction:ltr; margin-top:3px;">${fmt(c.pct1)}</div>
          </div>
          <div style="background:#d1fae5; padding:10px 6px; border-radius:5px; border:1px solid #6ee7b7;">
            <div style="font-size:10px; color:#064e3b; font-weight:600;">المتبقي من 22.5%</div>
            <div style="font-size:16px; font-weight:800; color:#064e3b; direction:ltr; margin-top:3px;">${fmt(c.remaining225)}</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-bottom:14px;">
    <div class="rpt-section" style="margin-bottom:0;">
      <div class="rpt-section-title green">الربح الفعلي</div>
      <div class="rpt-body">
        ${infoRow('إجمالي قيمة التوريد:', fmt(c.supply))}
        ${infoRow('إجمالي الشراء الفعلي:', fmt(c.actualTotal), 'red')}
        ${infoRow('إجمالي المصاريف:', fmt(c.expensesTotal), 'red')}
        ${infoRow('ضريبة 22.5% كاملة:', fmt(c.tax225), 'red')}
        <div class="big-result green" style="margin-top:8px;">
          <span class="lbl">صافي الربح الفعلي</span>
          <span class="val">${fmt(c.actualProfit)}</span>
        </div>
      </div>
    </div>

    <div class="rpt-section" style="margin-bottom:0;">
      <div class="rpt-section-title green">تقسيم صافي الربح</div>
      <div class="rpt-body" style="padding:0;">
        <table class="rpt-table">
          <thead><tr><th>الشخص</th><th>النسبة</th><th>نصيب الربح</th></tr></thead>
          <tbody>
            <tr><td>${PARTNERS.PARTNER_1}</td><td>${c.moazPct}%</td><td class="num">${fmt(c.moazProfitShare)}</td></tr>
            <tr><td>${PARTNERS.PARTNER_2}</td><td>${c.amrPct}%</td><td class="num">${fmt(c.amrProfitShare)}</td></tr>
          </tbody>
          <tfoot>
            <tr class="total-row">
              <td>المجموع</td>
              <td>${totalSplit}% ${!isValidSplit ? '⚠️' : ''}</td>
              <td class="num">${fmt(c.moazProfitShare+c.amrProfitShare)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  </div>

  <div class="rpt-section">
    <div class="rpt-section-title purple">التسوية النهائية</div>
    <div class="rpt-body">
      <div class="settle-cards">
        <div class="settle-card">
          <div class="card-title">المتبقي من 22.5%</div>
          <div class="card-sub">بعد خصم 1% لشركة المشتريات</div>
          <div class="card-value">${fmt(c.remaining225)}</div>
        </div>
        <div class="settle-card">
          <div class="card-title">حساب ${PARTNERS.PARTNER_2}</div>
          <div class="card-sub">نصيب الربح فقط</div>
          <div class="card-value">${fmt(c.amrTotal)}</div>
        </div>
        <div class="settle-card">
          <div class="card-title">حساب ${PARTNERS.PARTNER_1}</div>
          <div class="card-sub">نصيب الربح + المتبقي من 22.5%</div>
          <div class="card-value">${fmt(c.moazTotal)}</div>
          <div class="card-detail">= ${fmt(c.moazProfitShare)} + ${fmt(c.remaining225)}</div>
        </div>
      </div>
    </div>
  </div>

  <div class="rpt-section">
    <div class="rpt-section-title" style="background:#059669;">📄 ملخص التسوية النهائية</div>
    <div class="rpt-body">
      <div class="settle-summary">
        <div class="summary-row">
          <div>
            <div class="person-name">👤 ${PARTNERS.BUYER_NAME} (${PARTNERS.BUYER_COMPANY})</div>
            <div class="sub-details">14% من التوريد − VAT</div>
          </div>
          <div class="person-amount">${fmt(c.buyerNet)} ${APP_CONFIG.CURRENCY}</div>
        </div>
        <div class="summary-row">
          <div>
            <div class="person-name">👤 ${PARTNERS.PARTNER_2}</div>
            <div class="sub-details">نصيب الربح (${c.amrPct}%)</div>
          </div>
          <div class="person-amount">${fmt(c.amrTotal)} ${APP_CONFIG.CURRENCY}</div>
        </div>
        <div class="summary-row">
          <div>
            <div class="person-name">👤 ${PARTNERS.PARTNER_1}</div>
            <div class="sub-details">
              نصيب الربح (${c.moazPct}%): ${fmt(c.moazProfitShare)}<br>
              + المتبقي من 22.5%: ${fmt(c.remaining225)}
            </div>
          </div>
          <div class="person-amount">${fmt(c.moazTotal)} ${APP_CONFIG.CURRENCY}</div>
        </div>
        <div class="summary-total">
          <span>💰 إجمالي المبالغ المستحقة</span>
          <span>${fmt(c.buyerNet + c.amrTotal + c.moazTotal)} ${APP_CONFIG.CURRENCY}</span>
        </div>
      </div>
    </div>
  </div>

  <div class="signatures">
    <div class="sig-box">
      <div class="sig-title">إعداد:</div>
      <div class="sig-line">التاريخ: &nbsp;&nbsp;&nbsp;&nbsp;/&nbsp;&nbsp;&nbsp;&nbsp;/&nbsp;&nbsp;&nbsp;&nbsp;2026</div>
    </div>
    <div class="sig-box">
      <div class="sig-title">مراجعة:</div>
      <div class="sig-line">التاريخ: &nbsp;&nbsp;&nbsp;&nbsp;/&nbsp;&nbsp;&nbsp;&nbsp;/&nbsp;&nbsp;&nbsp;&nbsp;2026</div>
    </div>
    <div class="sig-box">
      <div class="sig-title">اعتماد الشريك:</div>
      <div class="sig-line">التاريخ: &nbsp;&nbsp;&nbsp;&nbsp;/&nbsp;&nbsp;&nbsp;&nbsp;/&nbsp;&nbsp;&nbsp;&nbsp;2026</div>
    </div>
  </div>
  <div class="rpt-footer">صفحة 1 من 1</div>
  `;
};

const renderAll = () => {
  renderSidebar();
  renderEditForm();
  renderReportView();
};

// ============================================
// الجزء 5: TRANSFERS CALC + CRUD + RENDERING
// ============================================

// ✅ إصلاح #7: العدادات بتتأثر بالفلتر
const calcTransferCounters = () => {
  const monthFilter = document.getElementById('transfer-month-filter');
  const filter = monthFilter ? monthFilter.value : '';
  
  let transfers = state.transfers.transactions || [];
  let purchases = state.transfers.purchases || [];
  
  if (filter) {
    transfers = transfers.filter(t => getMonthFromDate(t.date) === filter);
    purchases = purchases.filter(p => getMonthFromDate(p.date) === filter);
  }
  
  const totalTransfers = transfers.reduce((sum, t) => sum + parseNum(t.amount), 0);
  const totalReceivedPurchases = purchases
    .filter(p => p.status === 'received')
    .reduce((sum, p) => sum + parseNum(p.amount), 0);
  const totalPendingPurchases = purchases
    .filter(p => p.status === 'pending')
    .reduce((sum, p) => sum + parseNum(p.amount), 0);
  const totalProfitAllocated = transfers.reduce((sum, t) => {
    return sum + (t.allocations || [])
      .filter(a => a.type === 'profit')
      .reduce((s, a) => s + parseNum(a.amount), 0);
  }, 0);
  
  let totalBuyerProfit = state.checks.reduce((sum, chk) => {
    return sum + computeCheck(chk).buyerNet;
  }, 0);
  if (filter) {
    totalBuyerProfit = state.checks
      .filter(chk => chk.workMonth === filter)
      .reduce((sum, chk) => sum + computeCheck(chk).buyerNet, 0);
  }
  
  return {
    balance: round2(totalTransfers - totalReceivedPurchases),
    profitDue: round2(totalBuyerProfit - totalProfitAllocated),
    pending: round2(totalPendingPurchases)
  };
};

const renderTransfersPage = () => {
  const counters = calcTransferCounters();
  
  document.getElementById('counter-balance').textContent = fmt(counters.balance);
  document.getElementById('counter-profit').textContent = fmt(counters.profitDue);
  document.getElementById('counter-pending').textContent = fmt(counters.pending);
  
  renderTransfersList();
  renderPurchasesList();
  renderTransferMonthFilter();
};

const renderTransferMonthFilter = () => {
  const monthFilter = document.getElementById('transfer-month-filter');
  if (!monthFilter) return;
  const currentFilter = monthFilter.value;
  const transfers = state.transfers.transactions || [];
  const months = [...new Set(transfers.map(t => getMonthFromDate(t.date)).filter(Boolean))].sort();
  
  monthFilter.innerHTML = '<option value="">— كل الشهور —</option>' +
    months.map(m => `<option value="${m}" ${m===currentFilter?'selected':''}>${workMonthLabel(m)}</option>`).join('');
};

const renderTransfersList = () => {
  const list = document.getElementById('transfers-list');
  if (!list) return;
  
  const monthFilter = document.getElementById('transfer-month-filter');
  const filter = monthFilter ? monthFilter.value : '';
  
  let transfers = state.transfers.transactions || [];
  if (filter) {
    transfers = transfers.filter(t => getMonthFromDate(t.date) === filter);
  }
  
  if (transfers.length === 0) {
    list.innerHTML = '<div style="text-align:center; padding:40px; color:#94a3b8;">لا توجد تحويلات</div>';
    return;
  }
  
  list.innerHTML = transfers.map(t => {
    const allocations = t.allocations || [];
    const allocationsHTML = allocations.length > 0 
      ? `<div class="item-allocations">
           ${allocations.map(a => {
             const typeInfo = Object.values(ALLOCATION_TYPES).find(at => at.value === a.type) || { icon: '💵', label: a.type };
             return `<div class="allocation-item">
               <span class="allocation-type">${typeInfo.icon} ${typeInfo.label}</span>
               <span class="allocation-amount">${fmt(parseNum(a.amount))} ${APP_CONFIG.CURRENCY}</span>
             </div>`;
           }).join('')}
         </div>`
      : '';
    
    return `
      <div class="transfer-item">
        <div class="item-header">
          <div>
            <span class="item-type">${esc(t.type || 'تحويل')}</span>
            <span class="item-date">${t.date || '—'}</span>
          </div>
          <div class="item-amount">${fmt(parseNum(t.amount))} ${APP_CONFIG.CURRENCY}</div>
        </div>
        ${t.notes ? `<div class="item-notes">${esc(t.notes)}</div>` : ''}
        ${allocationsHTML}
        <div class="row-actions" style="margin-top:10px;">
          <button onclick="editTransfer('${t.id}')">✏️ تعديل</button>
          <button class="del" onclick="deleteTransfer('${t.id}')">🗑 حذف</button>
        </div>
      </div>
    `;
  }).join('');
};

const renderPurchasesList = () => {
  const list = document.getElementById('purchases-list');
  if (!list) return;
  
  const purchases = state.transfers.purchases || [];
  
  if (purchases.length === 0) {
    list.innerHTML = '<div style="text-align:center; padding:40px; color:#94a3b8;">لا توجد مشتريات</div>';
    return;
  }
  
  list.innerHTML = purchases.map(p => {
    const statusInfo = PURCHASE_STATUS[p.status.toUpperCase()] || PURCHASE_STATUS.PENDING;
    const statusBadge = `<span class="status-badge ${statusInfo.class}">${statusInfo.label}</span>`;
    
    const receiveBtn = p.status === 'pending'
      ? `<button onclick="markPurchaseReceived('${p.id}')">✅ استلام</button>`
      : '';
    
    return `
      <div class="purchase-item">
        <div class="item-header">
          <div>
            ${statusBadge}
            ${p.reference ? `<span style="margin-right:8px; color:#64748b; font-size:12px;">مرجع: ${esc(p.reference)}</span>` : ''}
            <span class="item-date">${p.date || '—'}</span>
          </div>
          <div class="item-amount">${fmt(parseNum(p.amount))} ${APP_CONFIG.CURRENCY}</div>
        </div>
        ${p.notes ? `<div class="item-notes">${esc(p.notes)}</div>` : ''}
        <div class="row-actions" style="margin-top:10px;">
          ${receiveBtn}
          <button onclick="editPurchase('${p.id}')">✏️ تعديل</button>
          <button class="del" onclick="deletePurchase('${p.id}')">🗑 حذف</button>
        </div>
      </div>
    `;
  }).join('');
};

const createNewTransfer = () => {
  const transfer = {
    id: uid(),
    date: new Date().toISOString().split('T')[0],
    amount: '',
    type: 'تحويل بنكي',
    notes: '',
    allocations: [],
    createdAt: Date.now()
  };
  editTransferDialog(transfer, true);
};

const editTransfer = (id) => {
  const transfer = state.transfers.transactions.find(t => t.id === id);
  if (transfer) {
    editTransferDialog(transfer, false);
  }
};

const deleteTransfer = (id) => {
  if (!confirm('هل أنت متأكد من حذف هذا التحويل؟')) return;
  state.transfers.transactions = state.transfers.transactions.filter(t => t.id !== id);
  state.transfers.purchases = state.transfers.purchases.filter(p => p.transferId !== id);
  saveState();
  renderTransfersPage();
};

const createNewPurchase = () => {
  const purchase = {
    id: uid(),
    date: new Date().toISOString().split('T')[0],
    amount: '',
    reference: '',
    notes: '',
    status: 'pending',
    createdAt: Date.now()
  };
  editPurchaseDialog(purchase, true);
};

const editPurchase = (id) => {
  const purchase = state.transfers.purchases.find(p => p.id === id);
  if (purchase) {
    editPurchaseDialog(purchase, false);
  }
};

const deletePurchase = (id) => {
  if (!confirm('هل أنت متأكد من حذف هذه المشتريات؟')) return;
  state.transfers.purchases = state.transfers.purchases.filter(p => p.id !== id);
  saveState();
  renderTransfersPage();
};

const markPurchaseReceived = (id) => {
  const purchase = state.transfers.purchases.find(p => p.id === id);
  if (purchase) {
    purchase.status = 'received';
    saveState();
    renderTransfersPage();
  }
};

const switchTransferTab = (tabName) => {
  document.querySelectorAll('#page-transfers .tab').forEach(t => 
    t.classList.toggle('active', t.dataset.tab === tabName)
  );
  document.querySelectorAll('#page-transfers .tab-content').forEach(t => 
    t.classList.toggle('active', t.id === 'transfer-tab-' + tabName)
  );
};

// ============================================
// الجزء 6: TRANSFERS DIALOGS
// ============================================

let currentTransferData = null;

const editTransferDialog = (transfer, isNew) => {
  currentTransferData = JSON.parse(JSON.stringify(transfer));
  
  const dialog = document.createElement('div');
  dialog.className = 'modal-overlay';
  dialog.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); z-index:9999; display:flex; align-items:center; justify-content:center;';
  
  const transferTypesHTML = TRANSFER_TYPES
    .map(tt => `<option value="${tt.value}" ${transfer.type === tt.value ? 'selected' : ''}>${tt.label}</option>`)
    .join('');
  
  dialog.innerHTML = `
    <div style="background:#fff; border-radius:8px; padding:20px; max-width:600px; width:90%; max-height:90vh; overflow-y:auto;">
      <h3 style="margin-bottom:15px; color:#1e3a5f;">${isNew ? '➕ تحويل جديد' : '✏️ تعديل تحويل'}</h3>
      
      <div style="margin-bottom:12px;">
        <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px;">التاريخ</label>
        <input type="date" id="t-date" value="${transfer.date}" style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:4px;">
      </div>
      
      <div style="margin-bottom:12px;">
        <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px;">المبلغ</label>
        <input type="text" id="t-amount" value="${transfer.amount > 0 ? fmt(transfer.amount) : ''}" inputmode="decimal" placeholder="0.00" style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:4px; text-align:center; direction:ltr;">
      </div>
      
      <div style="margin-bottom:12px;">
        <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px;">نوع التحويل</label>
        <select id="t-type" style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:4px;">
          ${transferTypesHTML}
        </select>
      </div>
      
      <div style="margin-bottom:12px;">
        <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px;">ملاحظات</label>
        <textarea id="t-notes" rows="3" style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:4px; resize:vertical;">${esc(transfer.notes)}</textarea>
      </div>
      
      <div style="margin-bottom:12px; padding:12px; background:#f8fafc; border-radius:5px;">
        <label style="display:block; font-size:12px; font-weight:600; margin-bottom:8px;">التقسيم (اختياري)</label>
        <div id="allocations-list"></div>
        <button onclick="addAllocation()" style="width:100%; padding:8px; background:#fff; border:1px dashed #94a3b8; border-radius:4px; cursor:pointer; color:#475569; font-size:12px;">➕ إضافة تقسيم</button>
      </div>
      
      <div style="display:flex; gap:8px;">
        <button onclick="saveTransfer('${transfer.id}', ${isNew})" style="flex:1; padding:10px; background:#059669; color:#fff; border:none; border-radius:4px; cursor:pointer; font-weight:600;">💾 حفظ</button>
        <button onclick="closeModal()" style="flex:1; padding:10px; background:#64748b; color:#fff; border:none; border-radius:4px; cursor:pointer; font-weight:600;">❌ إلغاء</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(dialog);
  renderAllocations();
};

const renderAllocations = () => {
  const list = document.getElementById('allocations-list');
  if (!list || !currentTransferData) return;
  
  list.innerHTML = (currentTransferData.allocations || []).map((a, i) => {
    const selectedType = a.type || 'purchase';
    return `
      <div style="display:grid; grid-template-columns:1fr 1fr auto; gap:8px; margin-bottom:8px;">
        <select class="alloc-type" data-idx="${i}" onchange="updateAllocationType(${i}, this.value)" style="padding:6px; border:1px solid #cbd5e1; border-radius:4px;">
          ${Object.values(ALLOCATION_TYPES).map(at => 
            `<option value="${at.value}" ${selectedType === at.value ? 'selected' : ''}>${at.icon} ${at.label}</option>`
          ).join('')}
        </select>
        <input type="text" class="alloc-amount" data-idx="${i}" value="${a.amount > 0 ? fmt(a.amount) : ''}" inputmode="decimal" placeholder="0.00" onchange="updateAllocationAmount(${i}, this.value)" style="padding:6px; border:1px solid #cbd5e1; border-radius:4px; text-align:center; direction:ltr;">
        <button onclick="removeAllocation(${i})" style="padding:6px 10px; background:#dc2626; color:#fff; border:none; border-radius:4px; cursor:pointer;">🗑</button>
      </div>
    `;
  }).join('');
};

const addAllocation = () => {
  if (!currentTransferData) return;
  currentTransferData.allocations = currentTransferData.allocations || [];
  currentTransferData.allocations.push({ type: 'purchase', amount: '' });
  renderAllocations();
};

const removeAllocation = (idx) => {
  if (!currentTransferData) return;
  currentTransferData.allocations.splice(idx, 1);
  renderAllocations();
};

const updateAllocationType = (idx, value) => {
  if (!currentTransferData || !currentTransferData.allocations[idx]) return;
  currentTransferData.allocations[idx].type = value;
};

const updateAllocationAmount = (idx, value) => {
  if (!currentTransferData || !currentTransferData.allocations[idx]) return;
  currentTransferData.allocations[idx].amount = parseNum(value);
};

// ✅ إصلاح #5: دمج مشتريات التحويل في purchase واحد
const saveTransfer = (id, isNew) => {
  const date = document.getElementById('t-date').value;
  const amount = parseNum(document.getElementById('t-amount').value);
  const type = document.getElementById('t-type').value;
  const notes = document.getElementById('t-notes').value;
  
  const transfer = {
    id,
    date,
    amount,
    type,
    notes,
    allocations: currentTransferData.allocations || [],
    createdAt: Date.now()
  };
  
  if (isNew) {
    state.transfers.transactions.push(transfer);
  } else {
    const idx = state.transfers.transactions.findIndex(t => t.id === id);
    if (idx !== -1) {
      state.transfers.transactions[idx] = transfer;
    }
  }
  
  // دمج كل تقسيمات "بضاعة" في purchase واحد
  const purchaseAllocations = transfer.allocations.filter(a => a.type === 'purchase' && a.amount > 0);
  const totalPurchaseAmount = purchaseAllocations.reduce((s, a) => s + a.amount, 0);
  
  // حذف purchases القديمة المرتبطة بالتحويل
  state.transfers.purchases = state.transfers.purchases.filter(p => p.transferId !== id);
  
  // إنشاء purchase جديد لو في مبالغ بضاعة
  if (totalPurchaseAmount > 0) {
    state.transfers.purchases.push({
      id: uid(),
      transferId: id,
      amount: totalPurchaseAmount,
      date: date,
      reference: '',
      notes: `من تحويل ${date}`,
      status: 'pending',
      createdAt: Date.now()
    });
  }
  
  saveState();
  closeModal();
  renderTransfersPage();
};

// ✅ إصلاح #2: حفظ حالة المشتريات القديمة
const editPurchaseDialog = (purchase, isNew) => {
  const dialog = document.createElement('div');
  dialog.className = 'modal-overlay';
  dialog.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); z-index:9999; display:flex; align-items:center; justify-content:center;';
  
  dialog.innerHTML = `
    <div style="background:#fff; border-radius:8px; padding:20px; max-width:500px; width:90%;">
      <h3 style="margin-bottom:15px; color:#1e3a5f;">${isNew ? '➕ مشتريات جديدة' : '✏️ تعديل مشتريات'}</h3>
      
      <div style="margin-bottom:12px;">
        <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px;">التاريخ</label>
        <input type="date" id="p-date" value="${purchase.date}" style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:4px;">
      </div>
      
      <div style="margin-bottom:12px;">
        <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px;">المبلغ</label>
        <input type="text" id="p-amount" value="${purchase.amount > 0 ? fmt(purchase.amount) : ''}" inputmode="decimal" placeholder="0.00" style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:4px; text-align:center; direction:ltr;">
      </div>
      
      <div style="margin-bottom:12px;">
        <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px;">رقم المرجع (اختياري)</label>
        <input type="text" id="p-reference" value="${esc(purchase.reference)}" placeholder="INV-001" style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:4px;">
      </div>
      
      <div style="margin-bottom:12px;">
        <label style="display:block; font-size:12px; font-weight:600; margin-bottom:4px;">ملاحظات</label>
        <textarea id="p-notes" rows="3" style="width:100%; padding:8px; border:1px solid #cbd5e1; border-radius:4px; resize:vertical;">${esc(purchase.notes)}</textarea>
      </div>
      
      <div style="display:flex; gap:8px;">
        <button onclick="savePurchase('${purchase.id}', ${isNew})" style="flex:1; padding:10px; background:#059669; color:#fff; border:none; border-radius:4px; cursor:pointer; font-weight:600;">💾 حفظ</button>
        <button onclick="closeModal()" style="flex:1; padding:10px; background:#64748b; color:#fff; border:none; border-radius:4px; cursor:pointer; font-weight:600;">❌ إلغاء</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(dialog);
};

const savePurchase = (id, isNew) => {
  const existing = state.transfers.purchases.find(p => p.id === id);
  
  const purchase = {
    id,
    date: document.getElementById('p-date').value,
    amount: parseNum(document.getElementById('p-amount').value),
    reference: document.getElementById('p-reference').value,
    notes: document.getElementById('p-notes').value,
    status: existing ? existing.status : 'pending',  // ✅ حافظ على الحالة
    createdAt: existing ? existing.createdAt : Date.now(),
    transferId: existing ? existing.transferId : undefined
  };
  
  if (isNew) {
    state.transfers.purchases.push(purchase);
  } else {
    const idx = state.transfers.purchases.findIndex(p => p.id === id);
    if (idx !== -1) {
      state.transfers.purchases[idx] = purchase;
    }
  }
  
  saveState();
  closeModal();
  renderTransfersPage();
};

const closeModal = () => {
  const modal = document.querySelector('.modal-overlay');
  if (modal) modal.remove();
  currentTransferData = null;
};

// ============================================
// الجزء 7: EXPORTS (PDF + Excel + JSON)
// ============================================

const exportCurrentPDF = async () => {
  const chk = getCurrentCheck();
  if (!chk) { alert('لا يوجد شيك محدد'); return; }

  switchTab('report');
  await new Promise(resolve => setTimeout(resolve, 150));
  
  const element = document.getElementById('report-view');
  if (!element) { alert('خطأ: التقرير غير جاهز'); return; }

  const btn = document.getElementById('btn-export-pdf');
  const origText = btn ? btn.textContent : '';
  if (btn) {
    btn.textContent = '⏳ جاري إنشاء PDF...';
    btn.disabled = true;
  }

  try {
    const opt = {
      margin: [8, 8, 8, 8],
      filename: `تقرير_شيك_${chk.checkNumber || 'بدون_رقم'}_${chk.workMonth}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        windowWidth: element.scrollWidth
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };
    await html2pdf().set(opt).from(element).save();
  } catch(err) {
    alert('خطأ في إنشاء PDF: ' + err.message);
  } finally {
    if (btn) {
      btn.textContent = origText;
      btn.disabled = false;
    }
  }
};

const exportTransfersPDF = async () => {
  const element = document.getElementById('page-transfers');
  if (!element) { alert('خطأ: الصفحة غير جاهزة'); return; }

  const btn = document.getElementById('btn-export-transfers-pdf');
  const origText = btn ? btn.textContent : '';
  if (btn) {
    btn.textContent = '⏳ جاري...';
    btn.disabled = true;
  }

  try {
    const opt = {
      margin: [10, 10, 10, 10],
      filename: `تقرير_التحويلات_${new Date().toISOString().slice(0,10)}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        windowWidth: element.scrollWidth
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };
    await html2pdf().set(opt).from(element).save();
  } catch(err) {
    alert('خطأ في إنشاء PDF: ' + err.message);
  } finally {
    if (btn) {
      btn.textContent = origText;
      btn.disabled = false;
    }
  }
};

const buildExcelRows = (chk, c) => {
  const rows = [];
  rows.push(['تقرير تسوية شيك']);
  rows.push(['تقرير رقم:', `CHK-${chk.workMonth}-${chk.checkNumber||'001'}`, '', 'شهر العمل:', workMonthLabel(chk.workMonth), 'رقم الشيك:', chk.checkNumber||'—']);
  rows.push([]);
  rows.push(['بيانات الشيك']);
  rows.push(['شهر العمل', workMonthLabel(chk.workMonth), '', 'قيمة التوريد حسب الشيك', c.supply, '', 'تم استلام الشيك', chk.received?'نعم':'لا']);
  rows.push(['رقم الشيك', chk.checkNumber||'—', '', 'قيمة 13%', c.pct13, '', 'تاريخ صرف الشيك', chk.checkDate||'—']);
  rows.push(['مبلغ الشيك الكامل', c.checkAmount, '', 'قيمة 1%', c.pct1, '', 'تاريخ التحصيل الفعلي', chk.collectionDate||'—']);
  rows.push([]);
  rows.push(['أوامر التوريد']);
  rows.push(['م', 'رقم أمر التوريد', 'قيمة التوريد', 'الشراء الفعلي']);
  (chk.supplyOrders||[]).forEach((o,i) => rows.push([i+1, o.orderNumber||'', parseNum(o.supplyValue), parseNum(o.actualPurchase)]));
  rows.push(['', 'إجمالي أوامر التوريد', c.supplyTotal, c.actualTotal]);
  if (c.supply > 0 && c.supplyTotal > 0) {
    rows.push(['', 'قيمة التوريد حسب الشيك', c.supply, '']);
    rows.push(['', 'الفرق', c.supplyDifference, c.supplyMatch ? 'متطابق ✓' : 'يوجد فرق ⚠']);
  }
  rows.push([]);
  rows.push(['الشراء الضريبي والقيمة المضافة']);
  rows.push(['إجمالي الشراء الضريبي', c.taxablePurchase]);
  rows.push(['القيمة المضافة المدفوعة مقدمًا (VAT)', c.vat]);
  rows.push([]);
  rows.push([`حساب ${PARTNERS.BUYER_COMPANY} - ${PARTNERS.BUYER_NAME}`]);
  rows.push(['مستحق 14% من التوريد', c.buyer14]);
  rows.push(['مغطى من 13% (معلومات)', c.pct13]);
  rows.push(['مغطى من 1% (معلومات)', c.pct1]);
  rows.push(['القيمة المضافة المدفوعة مقدمًا (خصم)', c.vat]);
  rows.push([`صافي مستحق ${PARTNERS.BUYER_NAME}`, c.buyerNet]);
  rows.push([]);
  rows.push(['المصاريف']);
  rows.push(['م', 'البند', 'القيمة']);
  (chk.expenses||[]).forEach((e,i) => rows.push([i+1, e.label||'', parseNum(e.value)]));
  rows.push(['', 'إجمالي المصاريف', c.expensesTotal]);
  rows.push([]);
  rows.push(['ضريبة 22.5%']);
  rows.push(['قيمة التوريد', c.supply]);
  rows.push(['إجمالي الشراء الضريبي', c.taxablePurchase]);
  rows.push(['الربح الضريبي', c.taxProfit]);
  rows.push(['ضريبة 22.5%', c.tax225]);
  rows.push([]);
  rows.push(['إجمالي ضريبة 22.5%', c.tax225]);
  rows.push(['1% المستخدم في تسوية شركة المشتريات', c.pct1]);
  rows.push(['المتبقي من 22.5% (22.5% − 1%)', c.remaining225]);
  rows.push([]);
  rows.push(['الربح الفعلي']);
  rows.push(['إجمالي قيمة التوريد', c.supply]);
  rows.push(['إجمالي الشراء الفعلي', c.actualTotal]);
  rows.push(['إجمالي المصاريف', c.expensesTotal]);
  rows.push(['ضريبة 22.5% كاملة', c.tax225]);
  rows.push(['صافي الربح الفعلي', c.actualProfit]);
  rows.push([]);
  rows.push(['تقسيم صافي الربح']);
  rows.push(['الشخص', 'النسبة', 'نصيب الربح']);
  rows.push([PARTNERS.PARTNER_1, c.moazPct+'%', c.moazProfitShare]);
  rows.push([PARTNERS.PARTNER_2, c.amrPct+'%', c.amrProfitShare]);
  rows.push(['المجموع', (c.moazPct+c.amrPct)+'%', c.moazProfitShare+c.amrProfitShare]);
  rows.push([]);
  rows.push(['التسوية النهائية']);
  rows.push([`حساب ${PARTNERS.PARTNER_1}`, c.moazTotal]);
  rows.push([`حساب ${PARTNERS.PARTNER_2}`, c.amrTotal]);
  rows.push(['المتبقي من 22.5% (رصيد ضريبي للتسوية)', c.remaining225]);
  rows.push([]);
  rows.push(['ملخص التسوية النهائية']);
  rows.push([PARTNERS.BUYER_NAME + ' (' + PARTNERS.BUYER_COMPANY + ')', c.buyerNet]);
  rows.push([PARTNERS.PARTNER_2, c.amrTotal]);
  rows.push([PARTNERS.PARTNER_1, c.moazTotal]);
  rows.push(['إجمالي المبالغ المستحقة', c.buyerNet + c.amrTotal + c.moazTotal]);
  return rows;
};

const exportCurrentExcel = () => {
  const chk = getCurrentCheck();
  if (!chk) { alert('لا يوجد شيك محدد'); return; }
  const c = computeCheck(chk);
  const wb = XLSX.utils.book_new();
  
  const rows = buildExcelRows(chk, c);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{wch:22}, {wch:22}, {wch:5}, {wch:28}, {wch:18}, {wch:12}, {wch:22}, {wch:18}];
  XLSX.utils.book_append_sheet(wb, ws, 'تقرير الشيك');
  XLSX.writeFile(wb, `تقرير_شيك_${chk.checkNumber||'بدون_رقم'}_${chk.workMonth}.xlsx`);
};

const exportAllExcel = () => {
  if (state.checks.length === 0) { alert('لا توجد بيانات'); return; }
  const wb = XLSX.utils.book_new();

  const summaryRows = [['شهر العمل','رقم الشيك','تاريخ صرف الشيك','مبلغ الشيك','قيمة التوريد','13%','1%','تم الاستلام','تاريخ التحصيل الفعلي']];
  state.checks.forEach(chk => {
    const c = computeCheck(chk);
    summaryRows.push([
      workMonthLabel(chk.workMonth), chk.checkNumber||'-', chk.checkDate||'-',
      c.checkAmount, c.supply, c.pct13, c.pct1,
      chk.received?'نعم':'لا', chk.collectionDate||'-'
    ]);
  });
  const ws1 = XLSX.utils.aoa_to_sheet(summaryRows);
  ws1['!cols'] = [{wch:18},{wch:14},{wch:14},{wch:16},{wch:16},{wch:12},{wch:12},{wch:12},{wch:16}];
  XLSX.utils.book_append_sheet(wb, ws1, 'ملخص الشيكات');

  const allC = state.checks.map(c => computeCheck(c));
  const cumTax225 = allC.reduce((s,c)=>s+c.tax225,0);
  const cum1pct = allC.reduce((s,c)=>s+c.pct1,0);
  const cumRemaining = round2(Math.max(0, cumTax225 - cum1pct));

  const cumRows = [
    ['الإجماليات التراكمية'],
    ['عدد الشيكات', state.checks.length],
    ['إجمالي قيمة الشيكات', allC.reduce((s,c)=>s+c.checkAmount,0)],
    ['إجمالي 22.5% التراكمي', cumTax225],
    ['إجمالي 1% التراكمي', cum1pct],
    ['المتبقي من 22.5% (22.5% − 1%)', cumRemaining]
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(cumRows);
  ws2['!cols'] = [{wch:35},{wch:20}];
  XLSX.utils.book_append_sheet(wb, ws2, 'الإجماليات');

  XLSX.writeFile(wb, `كل_الشيكات_${new Date().toISOString().slice(0,10)}.xlsx`);
};

// ✅ إصلاح #6: استيراد JSON آمن للملفات القديمة
const exportJSON = () => {
  const data = { 
    version: APP_CONFIG.VERSION, 
    exportedAt: new Date().toISOString(), 
    state 
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `checks_backup_v${APP_CONFIG.VERSION}_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

const importJSON = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!data.state || !Array.isArray(data.state.checks)) { 
        alert('ملف JSON غير صالح'); 
        return; 
      }
      if (!confirm(`سيتم استبدال البيانات بـ ${data.state.checks.length} شيك. هل أنت متأكد؟`)) return;
      
      // ✅ حماية من الملفات القديمة
      state = {
        checks: data.state.checks || [],
        currentCheckId: data.state.currentCheckId || null,
        currentPage: data.state.currentPage || 'checks',
        transfers: data.state.transfers || { transactions: [], purchases: [] }
      };
      
      saveState();
      switchPage(state.currentPage);
      alert('تم استيراد البيانات بنجاح');
    } catch(err) { 
      alert('خطأ: ' + err.message); 
    }
  };
  reader.readAsText(file);
  e.target.value = '';
};

// ============================================
// الجزء 8: NAVIGATION + EVENTS + INIT
// ============================================

const switchPage = (page) => {
  state.currentPage = page;
  saveState();
  
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === page);
  });
  
  document.querySelectorAll('.page-container').forEach(container => {
    container.classList.toggle('active', container.id === 'page-' + page);
  });
  
  document.getElementById('checks-sidebar').style.display = page === 'checks' ? '' : 'none';
  document.getElementById('transfers-sidebar').style.display = page === 'transfers' ? '' : 'none';
  
  if (page === 'checks') {
    renderAll();
  } else {
    renderTransfersPage();
  }
};

const bindEvents = () => {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchPage(btn.dataset.page));
  });
  
  // صفحة الشيكات
  document.getElementById('btn-new-check').addEventListener('click', createNewCheck);
  document.getElementById('btn-new-check-empty').addEventListener('click', createNewCheck);
  document.getElementById('month-filter').addEventListener('change', renderSidebar);
  
  document.getElementById('btn-export-pdf').addEventListener('click', exportCurrentPDF);
  document.getElementById('btn-export-excel').addEventListener('click', exportCurrentExcel);
  document.getElementById('btn-print').addEventListener('click', () => window.print());
  document.getElementById('btn-delete-check').addEventListener('click', deleteCurrentCheck);
  
  document.querySelectorAll('#page-checks .tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });
  
  document.getElementById('btn-clear-all').addEventListener('click', () => {
    if (confirm('سيتم حذف جميع البيانات. هل أنت متأكد؟')) {
      state = { 
        checks: [], 
        currentCheckId: null,
        currentPage: state.currentPage,
        transfers: { transactions: [], purchases: [] }
      };
      saveState();
      renderAll();
    }
  });
  document.getElementById('btn-export-all').addEventListener('click', exportAllExcel);
  document.getElementById('btn-export-json').addEventListener('click', exportJSON);
  document.getElementById('btn-import-json').addEventListener('click', () => {
    document.getElementById('file-import-json').click();
  });
  document.getElementById('file-import-json').addEventListener('change', importJSON);
  
  // صفحة التحويلات
  document.getElementById('btn-new-transfer').addEventListener('click', createNewTransfer);
  document.getElementById('btn-new-purchase').addEventListener('click', createNewPurchase);
  document.getElementById('btn-export-transfers-pdf').addEventListener('click', exportTransfersPDF);
  document.getElementById('transfer-month-filter').addEventListener('change', renderTransfersPage);
  
  document.querySelectorAll('#page-transfers .tab').forEach(tab => {
    tab.addEventListener('click', () => switchTransferTab(tab.dataset.tab));
  });
};

const init = () => {
  loadState();
  bindEvents();
  
  const currentPage = state.currentPage || 'checks';
  
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === currentPage);
  });
  
  document.querySelectorAll('.page-container').forEach(container => {
    container.classList.toggle('active', container.id === 'page-' + currentPage);
  });
  
  document.getElementById('checks-sidebar').style.display = currentPage === 'checks' ? '' : 'none';
  document.getElementById('transfers-sidebar').style.display = currentPage === 'transfers' ? '' : 'none';
  
  if (currentPage === 'checks') {
    renderAll();
  } else {
    renderTransfersPage();
  }
  
  console.log(`✅ ${APP_CONFIG.APP_NAME} v${APP_CONFIG.VERSION} جاهز`);
};

// START THE APP
init();
