// ============================================
// sidebar.js - القائمة الجانبية الموحدة
// ============================================

const createSidebar = (activePage) => {
  const sidebarHTML = `
    <aside class="sidebar">
      <div class="sidebar-header">
        <h1>🏢 النظام المالي الموحد</h1>
      </div>

      <button class="home-btn" onclick="window.location.href='index.html'">🏠 العودة للرئيسية</button>

      <!-- 📦 إدارة الشيكات -->
      <div class="sidebar-section">
        <div class="sidebar-section-title">📦 إدارة الشيكات</div>
        <a class="sidebar-link ${activePage === 'checks' ? 'active' : ''}" onclick="window.location.href='checks.html'">📋 الشيكات</a>
        <a class="sidebar-link ${activePage === 'buyer' ? 'active' : ''}" onclick="window.location.href='checks.html'">🏢 حساب شركة المشتريات</a>
        <a class="sidebar-link ${activePage === 'supply-orders' ? 'active' : ''}" onclick="window.location.href='checks.html'">📋 أوامر التوريد</a>
        <a class="sidebar-link ${activePage === 'checks-profits' ? 'active' : ''}" onclick="window.location.href='checks.html'">📈 أرباح الشيكات</a>
      </div>

      <!-- 💰 إدارة التمويل -->
      <div class="sidebar-section">
        <div class="sidebar-section-title">💰 إدارة التمويل</div>
        <ul class="nav-menu">
          <li class="nav-item ${activePage === 'orders' ? 'active' : ''}" data-view="orders" onclick="App.switchView('orders')">📝 العمليات</li>
          <li class="nav-item ${activePage === 'profits' ? 'active' : ''}" data-view="profits" onclick="App.switchView('profits')">💵 أرباح التمويل</li>
          <li class="nav-item ${activePage === 'dashboard' ? 'active' : ''}" data-view="dashboard" onclick="App.switchView('dashboard')">📊 Dashboard</li>
        </ul>
      </div>

      <!-- 👥 الأقسام المشتركة -->
      <div class="sidebar-section">
        <div class="sidebar-section-title">👥 الأقسام المشتركة</div>
        <a class="sidebar-link shared ${activePage === 'customers' ? 'active' : ''}" onclick="window.location.href='customers.html'"> العملاء</a>
        <a class="sidebar-link shared ${activePage === 'funders' ? 'active' : ''}" onclick="window.location.href='funders.html'">🤝 الممولين</a>
      </div>

      <!-- 💎 الأرباح -->
      <div class="sidebar-section">
        <div class="sidebar-section-title">💎 الأرباح</div>
        <a class="sidebar-link shared" onclick="window.location.href='profits.html'">💰 أرباحي الشاملة</a>
      </div>

      <!-- 🛠️ أدوات -->
      <div class="sidebar-section">
        <div class="sidebar-section-title">🛠️ أدوات</div>
        <button class="sidebar-link tools" onclick="App.exportJSON()">💾 تصدير JSON</button>
        <button class="sidebar-link tools" onclick="document.getElementById('file-import').click()">📂 استيراد JSON</button>
        <button class="sidebar-link danger" onclick="App.clearAllData()">🗑 حذف كل البيانات</button>
      </div>
    </aside>
  `;

  // ✅ الحل: حقن الـ sidebar داخل .app div (وليس في body)
  const appContainer = document.querySelector('.app');
  if (appContainer) {
    appContainer.insertAdjacentHTML('afterbegin', sidebarHTML);
  } else {
    // Fallback: إذا لم يوجد .app، نضيفه للـ body
    document.body.insertAdjacentHTML('afterbegin', sidebarHTML);
  }
};

// CSS للقائمة الجانبية (يُحقن تلقائياً)
const sidebarCSS = `
.sidebar {
  background: #0f172a;
  color: #e2e8f0;
  padding: 12px;
  overflow-y: auto;
  max-height: 100vh;
  position: sticky;
  top: 0;
}
.sidebar-header {
  background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 12px;
  text-align: center;
  border: 1px solid #334155;
}
.sidebar-header h1 {
  font-size: 13px;
  color: #fbbf24;
  margin: 0;
  font-weight: 700;
}
.home-btn {
  width: 100%;
  padding: 10px;
  background: linear-gradient(135deg, #7c3aed, #6d28d9);
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 700;
  margin-bottom: 12px;
  font-family: inherit;
  font-size: 13px;
  transition: .2s;
}
.home-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(124, 58, 237, .4);
}
.sidebar-section {
  margin-bottom: 14px;
}
.sidebar-section-title {
  font-size: 10px;
  margin: 10px 0 5px;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: .5px;
  font-weight: 700;
  padding-bottom: 4px;
  border-bottom: 1px solid #1e293b;
}
.nav-menu {
  list-style: none;
  margin: 0;
  padding: 0;
}
.nav-item {
  padding: 9px 11px;
  margin-bottom: 3px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  color: #cbd5e1;
  transition: .15s;
  display: flex;
  align-items: center;
  gap: 8px;
}
.nav-item:hover {
  background: #1e293b;
  color: #fff;
}
.nav-item.active {
  background: #1d4ed8;
  color: #fff;
  box-shadow: 0 2px 8px rgba(29, 78, 216, .3);
}
.sidebar-link {
  display: block;
  width: 100%;
  padding: 8px 11px;
  margin-bottom: 3px;
  border-radius: 5px;
  border: 1px solid #1e293b;
  background: transparent;
  color: #cbd5e1;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  font-weight: 600;
  text-align: right;
  transition: .15s;
  text-decoration: none;
}
.sidebar-link:hover {
  background: #1e293b;
  color: #fff;
  border-color: #334155;
}
.sidebar-link.active {
  background: #1d4ed8;
  border-color: #1d4ed8;
  color: #fff;
}
.sidebar-link.shared {
  background: #065f46;
  border-color: #065f46;
  color: #fff;
}
.sidebar-link.shared:hover {
  background: #047857;
}
.sidebar-link.tools {
  background: #1e293b;
  border-color: #334155;
}
.sidebar-link.danger {
  background: #7f1d1d;
  border-color: #7f1d1d;
  color: #fff;
}
.sidebar-link.danger:hover {
  background: #991b1b;
}
`;

// حقن CSS عند تحميل الملف (فقط إذا لم يكن موجوداً مسبقاً)
if (!document.getElementById('sidebar-injected-css')) {
  const styleSheet = document.createElement('style');
  styleSheet.id = 'sidebar-injected-css';
  styleSheet.textContent = sidebarCSS;
  document.head.appendChild(styleSheet);
}
