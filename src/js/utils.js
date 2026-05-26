/**
 * DutchIT – Utility Functions
 */

/**
 * Generate a random alphanumeric string of given length
 */
export function randomAlphanumeric(length = 10) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generate a unique user ID
 */
export function generateUserId() {
  return `usr_${randomAlphanumeric(10)}`;
}

/**
 * Generate a group ID: creatorUserId + 10 alphanumeric chars
 */
export function generateGroupId(userId) {
  return `${userId}_${randomAlphanumeric(10).toUpperCase()}`;
}

/**
 * Generate an expense ID
 */
export function generateExpenseId() {
  return `exp_${Date.now()}_${randomAlphanumeric(6)}`;
}

/**
 * Generate a member ID for dummy members
 */
export function generateDummyMemberId() {
  return `dmb_${randomAlphanumeric(8)}`;
}

/**
 * Format a date string to display format
 */
export function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Format a timestamp to relative time
 */
export function timeAgo(dateStr) {
  if (!dateStr) return '';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;

  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return formatDate(dateStr);
}

/**
 * Get initials from a name (up to 2 chars)
 */
export function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/**
 * Generate a consistent color from a string (for avatars)
 */
const AVATAR_COLORS = [
  ['#1E3A8A','#3B82F6'], // blue
  ['#065F46','#10B981'], // green
  ['#7C3AED','#A78BFA'], // purple
  ['#B45309','#F59E0B'], // amber
  ['#BE185D','#F472B6'], // pink
  ['#0E7490','#22D3EE'], // cyan
  ['#B91C1C','#F87171'], // red
  ['#EA580C','#FB923C'], // orange
];

export function getAvatarColors(name) {
  if (!name) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i);
    hash |= 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/**
 * Debounce a function
 */
export function debounce(fn, delay = 300) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * Validate: is string non-empty and within length?
 */
export function validateLength(str, min = 1, max = 100) {
  const s = (str || '').trim();
  return s.length >= min && s.length <= max;
}

/**
 * Parse a number safely
 */
export function parseNum(val) {
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

/**
 * Round to N decimal places
 */
export function round(num, decimals = 2) {
  return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    return true;
  }
}

/**
 * Generate a share link for a group
 */
export function getGroupShareLink(groupId) {
  return `${window.location.origin}${window.location.pathname}#join/${groupId}`;
}

/**
 * Read a file as base64
 */
export function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Compress image to fit within maxKB
 */
export function compressImage(dataUrl, maxKB = 200) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      const MAX = 400;
      if (width > MAX || height > MAX) {
        const ratio = Math.min(MAX / width, MAX / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      let quality = 0.85;
      let result = canvas.toDataURL('image/jpeg', quality);
      while (result.length > maxKB * 1024 && quality > 0.3) {
        quality -= 0.1;
        result = canvas.toDataURL('image/jpeg', quality);
      }
      resolve(result);
    };
    img.src = dataUrl;
  });
}

/**
 * Escape HTML
 */
export function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Generate today's date in YYYY-MM-DD format
 */
export function todayStr() {
  return new Date().toISOString().split('T')[0];
}

/** Category emoji map */
export const EXPENSE_CATEGORIES = [
  { id:'food',       label:'Food & Dining',      emoji:'🍽️',  color:'#F59E0B', bg:'#FFFBEB' },
  { id:'accommodation', label:'Accommodation',   emoji:'🏨',  color:'#3B82F6', bg:'#EFF6FF' },
  { id:'transport',  label:'Transport',           emoji:'🚗',  color:'#10B981', bg:'#ECFDF5' },
  { id:'shopping',   label:'Shopping',            emoji:'🛍️', color:'#EC4899', bg:'#FDF2F8' },
  { id:'entertainment', label:'Entertainment',    emoji:'🎭', color:'#8B5CF6', bg:'#F5F3FF' },
  { id:'tours',      label:'Tours & Activities',  emoji:'🗺️', color:'#14B8A6', bg:'#F0FDFA' },
  { id:'communication', label:'Communication',   emoji:'📱',  color:'#6366F1', bg:'#EEF2FF' },
  { id:'health',     label:'Health & Medical',    emoji:'⚕️', color:'#EF4444', bg:'#FEF2F2' },
  { id:'visa',       label:'Visa & Travel Docs',  emoji:'🛂', color:'#F97316', bg:'#FFF7ED' },
  { id:'insurance',  label:'Insurance',           emoji:'🔒', color:'#64748B', bg:'#F8FAFC' },
  { id:'forex',      label:'Currency Exchange',   emoji:'💱', color:'#0EA5E9', bg:'#F0F9FF' },
  { id:'fuel',       label:'Fuel',                emoji:'⛽', color:'#78716C', bg:'#FAFAF9' },
  { id:'parking',    label:'Parking',             emoji:'🅿️', color:'#6B7280', bg:'#F9FAFB' },
  { id:'tips',       label:'Tips & Gratuity',     emoji:'💝', color:'#F43F5E', bg:'#FFF1F2' },
  { id:'other',      label:'Other',               emoji:'📌', color:'#94A3B8', bg:'#F8FAFC' },
];

export function getCategoryById(id) {
  return EXPENSE_CATEGORIES.find(c => c.id === id) || EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1];
}

export const PAYMENT_METHODS = [
  'Cash',
  'Credit Card',
  'Debit Card',
  'Bank Transfer',
  'Digital Wallet (PayPal/Wise)',
  'Cryptocurrency',
  'Other',
];
