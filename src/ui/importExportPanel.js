/**
 * DutchIT – Import / Export expenses UI
 */
import { Expenses } from '../js/expenses.js';
import {
  downloadImportTemplate,
  parseAndImportExpenses,
  exportExpensesExcel,
  exportExpensesPdf,
} from '../js/importExport.js';
import { escapeHtml } from '../js/utils.js';
import { openModal, closeModal, showToast } from './modals.js';

export function openImportExportPanel(group, onDone) {
  const expenses = Expenses.getForGroup(group.groupId);

  const content = `
    <div class="import-export-panel">
      <p class="import-export-intro">
        Bulk-add expenses from Excel (.xlsx) or CSV, or download a full summary of all expenses submitted so far.
        The template includes your group members and validation lists on separate sheets.
      </p>

      <section class="import-export-section">
        <h3 class="import-export-heading">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          Import expenses
        </h3>
        <ol class="import-export-steps">
          <li>Download the template (members &amp; dropdown rules pre-filled).</li>
          <li>Fill one row per expense; use Credit (paid) and Debit (share) columns per member.</li>
          <li>Upload the completed .xlsx or .csv file.</li>
        </ol>
        <div class="import-export-actions">
          <button type="button" class="btn btn-secondary" id="ie-template-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            Download template
          </button>
          <label class="btn btn-orange ie-upload-label">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Upload file
            <input type="file" id="ie-file-input" accept=".xlsx,.xls,.csv" hidden />
          </label>
        </div>
        <div id="ie-import-status" class="import-export-status hidden"></div>
      </section>

      <section class="import-export-section">
        <h3 class="import-export-heading">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Export summary
        </h3>
        <p class="import-export-desc">
          ${expenses.length} expense(s) in <strong>${escapeHtml(group.name)}</strong>.
          Includes S. No., particulars, invoice details, transaction charges, category, who added each expense,
          and per-member credit (paid) and debit (share) columns, plus totals and suggested settlements.
        </p>
        <div class="import-export-actions">
          <button type="button" class="btn btn-primary" id="ie-export-xlsx" ${expenses.length ? '' : 'disabled'}>
            Excel (.xlsx)
          </button>
          <button type="button" class="btn btn-secondary" id="ie-export-pdf" ${expenses.length ? '' : 'disabled'}>
            PDF
          </button>
        </div>
        ${expenses.length === 0 ? '<p class="import-export-hint">Add at least one expense before exporting a summary.</p>' : ''}
      </section>
    </div>
  `;

  const modal = openModal({
    title: 'Import & Export Expenses',
    content,
    footer: '<button type="button" class="btn btn-ghost" id="ie-close-btn">Close</button>',
    size: 'modal-wide',
  });

  modal.querySelector('#ie-close-btn')?.addEventListener('click', closeModal);

  modal.querySelector('#ie-template-btn')?.addEventListener('click', async () => {
    try {
      await downloadImportTemplate(group);
      showToast('Template downloaded.', 'success');
    } catch (e) {
      showToast(e.message || 'Could not create template.', 'error');
    }
  });

  modal.querySelector('#ie-file-input')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const statusEl = modal.querySelector('#ie-import-status');
    statusEl.classList.remove('hidden');
    statusEl.innerHTML = '<span class="import-export-loading">Importing…</span>';

    try {
      const results = await parseAndImportExpenses(file, group);
      let html = `<div class="import-export-result ${results.errors.length ? 'has-errors' : 'success'}">`;
      html += `<strong>Imported ${results.imported} expense(s).</strong>`;
      if (results.skipped) html += ` Skipped ${results.skipped} blank/sample row(s).`;
      if (results.errors.length) {
        html += '<ul class="import-export-errors">';
        results.errors.slice(0, 15).forEach(err => {
          html += `<li>Row ${err.row}: ${escapeHtml(err.message)}</li>`;
        });
        if (results.errors.length > 15) {
          html += `<li>…and ${results.errors.length - 15} more error(s)</li>`;
        }
        html += '</ul>';
      }
      html += '</div>';
      statusEl.innerHTML = html;

      if (results.imported > 0) {
        showToast(`Imported ${results.imported} expense(s).`, 'success');
        if (typeof onDone === 'function') onDone();
        const ex = Expenses.getForGroup(group.groupId);
        modal.querySelector('#ie-export-xlsx')?.toggleAttribute('disabled', ex.length === 0);
        modal.querySelector('#ie-export-pdf')?.toggleAttribute('disabled', ex.length === 0);
      } else if (results.errors.length) {
        showToast('Import finished with errors.', 'error');
      }
    } catch (err) {
      statusEl.innerHTML = `<div class="import-export-result has-errors">${escapeHtml(err.message || 'Import failed.')}</div>`;
      showToast(err.message || 'Import failed.', 'error');
    }
  });

  modal.querySelector('#ie-export-xlsx')?.addEventListener('click', async () => {
    const ex = Expenses.getForGroup(group.groupId);
    try {
      await exportExpensesExcel(group, ex);
      showToast('Excel summary downloaded.', 'success');
    } catch (e) {
      showToast(e.message || 'Export failed.', 'error');
    }
  });

  modal.querySelector('#ie-export-pdf')?.addEventListener('click', async () => {
    const ex = Expenses.getForGroup(group.groupId);
    try {
      await exportExpensesPdf(group, ex);
      showToast('PDF summary downloaded.', 'success');
    } catch (e) {
      showToast(e.message || 'Export failed.', 'error');
    }
  });
}
