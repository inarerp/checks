/* =========================================================
   CONFIG.JS - مركز البيانات والإعدادات
   ========================================================= */

const TAX = {
  VAT_DIVISOR: 1.13,
  VAT_RATE: 0.13,
  DEDUCTION_RATE: 0.01,
  TAX_RATE: 0.225,
  BUYER_RATE: 0.14,
  DEFAULT_SPLIT: 50
};

const PARTNERS = {
  BUYER_COMPANY: 'شركة المشتريات',
  BUYER_NAME: '',
  PARTNER_1: 'محمد أبو زيد',
  PARTNER_2: 'عمرو'
};

const MONTHS_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

const STORAGE_KEY = 'checks_app_v8';

const APP_CONFIG = {
  VERSION: '8.3',
  APP_NAME: 'إدارة وتسوية الشيكات',
  AUTO_SAVE_DELAY: 300,
  MAX_UNDO_STEPS: 50,
  CURRENCY: 'ج.م',
  LOCALE: 'en-US'
};

const TRANSFER_TYPES = [
  { value: 'تحويل بنكي', label: '🏦 تحويل بنكي' },
  { value: 'كاش', label: '💵 كاش' },
  { value: 'شيك', label: '📝 شيك' }
];

const ALLOCATION_TYPES = {
  PURCHASE: { value: 'purchase', label: 'بضاعة', icon: '📦' },
  DEPOSIT: { value: 'deposit', label: 'عربون', icon: '💵' },
  PROFIT: { value: 'profit', label: 'من الأرباح', icon: '📈' }
};

const PURCHASE_STATUS = {
  PENDING: { value: 'pending', label: '⏳ معلقة', class: 'status-pending' },
  RECEIVED: { value: 'received', label: '✅ مستلمة', class: 'status-received' }
};

const CHECK_STATUS = {
  NONE: { cls: 'status-none', text: 'لم يُستلم' },
  RECEIVED: { cls: 'status-received', text: 'تم الاستلام' },
  COLLECTED: { cls: 'status-collected', text: 'تم التحصيل' }
};
