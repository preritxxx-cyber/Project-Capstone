/**
 * DutchIT – Analysis Tab (filters + Chart.js visualizations)
 */
import {
  DEFAULT_FILTERS,
  filterExpenses,
  getAnalysisSummary,
  aggregateByCategory,
  aggregateByPerson,
  aggregateByDate,
  getDateBounds,
  getCategoryOptions,
} from '../js/analysis.js';
import { formatAmount } from '../js/currencies.js';
import { escapeHtml, round } from '../js/utils.js';
import {
  Chart,
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';

Chart.register(
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

let _chartInstances = [];
let _filters = { ...DEFAULT_FILTERS };

function destroyCharts() {
  _chartInstances.forEach(c => c.destroy());
  _chartInstances = [];
}

export function renderAnalysisTab(group, expenses) {
  const bounds = getDateBounds(expenses);
  const summary = getAnalysisSummary(group, expenses, _filters);
  const categories = getCategoryOptions();
  const filtered = filterExpenses(expenses, _filters);

  if (expenses.length === 0) {
    return `
      <div class="empty-state">
        <div class="empty-state-icon">📊</div>
        <div class="empty-state-title">No data to analyse yet</div>
        <div class="empty-state-desc">Add expenses (even with just a description and category) to see breakdowns here.</div>
      </div>
    `;
  }

  return `
    <div class="analysis-panel">
      <!-- Filters -->
      <div class="card" style="margin-bottom:var(--sp-5)">
        <div class="card-header">
          <span style="font-weight:700">Filters</span>
          <button type="button" class="btn btn-ghost btn-sm" id="an-reset-filters">Reset</button>
        </div>
        <div class="analysis-filters">
          <div class="form-field">
            <label class="form-label" for="an-date-from">From date</label>
            <input type="date" id="an-date-from" class="form-input" value="${_filters.dateFrom}" min="${bounds.min}" max="${bounds.max}" />
          </div>
          <div class="form-field">
            <label class="form-label" for="an-date-to">To date</label>
            <input type="date" id="an-date-to" class="form-input" value="${_filters.dateTo}" min="${bounds.min}" max="${bounds.max}" />
          </div>
          <div class="form-field">
            <label class="form-label" for="an-category">Category</label>
            <select id="an-category" class="form-input">
              <option value="">All categories</option>
              ${categories.map(c => `
                <option value="${c.id}" ${_filters.category === c.id ? 'selected' : ''}>${c.emoji} ${escapeHtml(c.label)}</option>
              `).join('')}
            </select>
          </div>
          <div class="form-field">
            <label class="form-label" for="an-member">Member</label>
            <select id="an-member" class="form-input">
              <option value="">All members</option>
              ${group.members.map(m => `
                <option value="${m.memberId}" ${_filters.memberId === m.memberId ? 'selected' : ''}>${escapeHtml(m.name)}</option>
              `).join('')}
            </select>
          </div>
        </div>
        <p class="form-hint" style="padding:0 var(--sp-5) var(--sp-4);margin:0">
          Showing <strong>${filtered.length}</strong> of ${expenses.length} expenses
          ${bounds.min ? ` · Trip dates ${bounds.min} to ${bounds.max}` : ''}
        </p>
      </div>

      <!-- Summary KPIs -->
      <div class="analysis-kpis">
        <div class="analysis-kpi">
          <div class="analysis-kpi-label">Total spend</div>
          <div class="analysis-kpi-value">${formatAmount(summary.totalAmount, summary.baseCurrency)}</div>
        </div>
        <div class="analysis-kpi">
          <div class="analysis-kpi-label">Expenses</div>
          <div class="analysis-kpi-value">${summary.expenseCount}</div>
        </div>
        <div class="analysis-kpi">
          <div class="analysis-kpi-label">Average / expense</div>
          <div class="analysis-kpi-value">${formatAmount(summary.avgAmount, summary.baseCurrency)}</div>
        </div>
        <div class="analysis-kpi">
          <div class="analysis-kpi-label">Base currency</div>
          <div class="analysis-kpi-value" style="font-size:var(--fs-lg)">${summary.baseCurrency}</div>
        </div>
      </div>

      ${filtered.length === 0 ? `
        <div class="empty-state" style="margin-top:var(--sp-5)">
          <div class="empty-state-title">No expenses match filters</div>
          <div class="empty-state-desc">Adjust filters to see charts and tables.</div>
        </div>
      ` : `
        <!-- Category -->
        <div class="card analysis-chart-card">
          <div class="card-header">
            <span style="font-weight:700">By category</span>
          </div>
          <div class="analysis-chart-row">
            <div class="analysis-chart-wrap"><canvas id="an-chart-category"></canvas></div>
            <div class="analysis-table-wrap" id="an-table-category"></div>
          </div>
        </div>

        <!-- Person -->
        <div class="card analysis-chart-card">
          <div class="card-header">
            <span style="font-weight:700">By person</span>
            <span class="badge badge-gray" style="font-size:10px">Paid vs share (${summary.baseCurrency})</span>
          </div>
          <div class="analysis-chart-row">
            <div class="analysis-chart-wrap analysis-chart-wrap--wide"><canvas id="an-chart-person"></canvas></div>
            <div class="analysis-table-wrap" id="an-table-person"></div>
          </div>
        </div>

        <!-- Date -->
        <div class="card analysis-chart-card">
          <div class="card-header">
            <span style="font-weight:700">By date</span>
          </div>
          <div class="analysis-chart-row">
            <div class="analysis-chart-wrap analysis-chart-wrap--wide"><canvas id="an-chart-date"></canvas></div>
            <div class="analysis-table-wrap" id="an-table-date"></div>
          </div>
        </div>
      `}
    </div>
  `;
}

function renderCategoryTable(container, rows, baseCurrency) {
  if (!container) return;
  const total = rows.reduce((s, r) => s + r.total, 0) || 1;
  container.innerHTML = `
    <table class="analysis-table">
      <thead><tr><th>Category</th><th>Amount</th><th>%</th><th>#</th></tr></thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td><span style="margin-right:6px">${r.emoji}</span>${escapeHtml(r.label)}</td>
            <td style="font-weight:600">${formatAmount(r.total, baseCurrency)}</td>
            <td>${round((r.total / total) * 100, 1)}%</td>
            <td>${r.count}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderPersonTable(container, rows, baseCurrency) {
  if (!container) return;
  container.innerHTML = `
    <table class="analysis-table">
      <thead><tr><th>Member</th><th>Paid</th><th>Share</th><th># Paid</th></tr></thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td style="font-weight:600">${escapeHtml(r.name)}</td>
            <td>${formatAmount(r.paid, baseCurrency)}</td>
            <td>${formatAmount(r.share, baseCurrency)}</td>
            <td>${r.expenseCount}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderDateTable(container, rows, baseCurrency) {
  if (!container) return;
  container.innerHTML = `
    <table class="analysis-table">
      <thead><tr><th>Date</th><th>Amount</th><th>#</th></tr></thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td style="font-weight:600">${escapeHtml(r.date)}</td>
            <td>${formatAmount(r.total, baseCurrency)}</td>
            <td>${r.count}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function mountCategoryChart(canvas, rows, baseCurrency) {
  if (!canvas || rows.length === 0) return;
  const chart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: rows.map(r => `${r.emoji} ${r.label}`),
      datasets: [{
        data: rows.map(r => r.total),
        backgroundColor: rows.map(r => r.color),
        borderWidth: 2,
        borderColor: '#fff',
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.label}: ${formatAmount(ctx.raw, baseCurrency)}`,
          },
        },
      },
    },
  });
  _chartInstances.push(chart);
}

function mountPersonChart(canvas, rows, baseCurrency) {
  if (!canvas || rows.length === 0) return;
  const chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: rows.map(r => r.name),
      datasets: [
        {
          label: 'Paid',
          data: rows.map(r => r.paid),
          backgroundColor: 'rgba(37, 99, 235, 0.75)',
          borderRadius: 4,
        },
        {
          label: 'Share (owed)',
          data: rows.map(r => r.share),
          backgroundColor: 'rgba(249, 115, 22, 0.75)',
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      scales: {
        x: { grid: { display: false } },
        y: {
          beginAtZero: true,
          ticks: {
            callback: (v) => formatAmount(v, baseCurrency),
          },
        },
      },
      plugins: {
        legend: { position: 'top' },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${formatAmount(ctx.raw, baseCurrency)}`,
          },
        },
      },
    },
  });
  _chartInstances.push(chart);
}

function mountDateChart(canvas, rows, baseCurrency) {
  if (!canvas || rows.length === 0) return;
  const chart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: rows.map(r => r.date),
      datasets: [{
        label: `Daily spend (${baseCurrency})`,
        data: rows.map(r => r.total),
        borderColor: '#1E40AF',
        backgroundColor: 'rgba(59, 130, 246, 0.15)',
        fill: true,
        tension: 0.3,
        pointRadius: 4,
        pointBackgroundColor: '#2563EB',
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      scales: {
        x: { grid: { display: false }, ticks: { maxRotation: 45, minRotation: 0, font: { size: 10 } } },
        y: {
          beginAtZero: true,
          ticks: { callback: (v) => formatAmount(v, baseCurrency) },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => formatAmount(ctx.raw, baseCurrency),
          },
        },
      },
    },
  });
  _chartInstances.push(chart);
}

/** Mount charts and wire filter events — call after tab HTML is in DOM */
export function mountAnalysisTab(group, expenses, onRefresh) {
  destroyCharts();

  const filtered = filterExpenses(expenses, _filters);
  bindFilterEvents(onRefresh);

  if (filtered.length === 0) return;

  const baseCurrency = group?.baseCurrency || 'USD';

  try {
    const byCategory = aggregateByCategory(group, expenses, _filters);
    renderCategoryTable(document.getElementById('an-table-category'), byCategory, baseCurrency);
    mountCategoryChart(document.getElementById('an-chart-category'), byCategory, baseCurrency);
  } catch (e) {
    console.error('Analysis: category chart failed', e);
  }

  try {
    const byPerson = aggregateByPerson(group, expenses, _filters);
    renderPersonTable(document.getElementById('an-table-person'), byPerson, baseCurrency);
    mountPersonChart(document.getElementById('an-chart-person'), byPerson, baseCurrency);
  } catch (e) {
    console.error('Analysis: person chart failed', e);
  }

  try {
    const byDate = aggregateByDate(group, expenses, _filters);
    renderDateTable(document.getElementById('an-table-date'), byDate, baseCurrency);
    mountDateChart(document.getElementById('an-chart-date'), byDate, baseCurrency);
  } catch (e) {
    console.error('Analysis: date chart failed', e);
  }
}

function bindFilterEvents(onRefresh) {
  const apply = () => {
    _filters = {
      dateFrom: document.getElementById('an-date-from')?.value || '',
      dateTo: document.getElementById('an-date-to')?.value || '',
      category: document.getElementById('an-category')?.value || '',
      memberId: document.getElementById('an-member')?.value || '',
    };
    if (typeof onRefresh === 'function') onRefresh();
  };

  document.getElementById('an-date-from')?.addEventListener('change', apply);
  document.getElementById('an-date-to')?.addEventListener('change', apply);
  document.getElementById('an-category')?.addEventListener('change', apply);
  document.getElementById('an-member')?.addEventListener('change', apply);

  document.getElementById('an-reset-filters')?.addEventListener('click', () => {
    _filters = { ...DEFAULT_FILTERS };
    if (typeof onRefresh === 'function') onRefresh();
  });
}

/** Reset filters when leaving group (optional) */
export function resetAnalysisFilters() {
  _filters = { ...DEFAULT_FILTERS };
  destroyCharts();
}
