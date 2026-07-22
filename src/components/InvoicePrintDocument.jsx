import React from 'react';
import { customerPrimaryName, customerSecondaryName } from '../utils/customer';

// A compact, purpose-built invoice laid out for A4 paper. It is rendered into a body-level
// portal (#print-root) and is the ONLY thing shown when printing — see the print rules in
// index.css. This is intentionally NOT the on-screen modal: printing the modal dragged the
// whole (invisible) app layout onto the page and wasted paper. Serial numbers print as one
// inline, comma-separated line per product instead of a chip-per-serial grid.
export const InvoicePrintDocument = ({ invoice, groups }) => {
  if (!invoice) return null;
  const rows = groups || [];
  const totalUnits = rows.reduce((sum, g) => sum + (g.qty || 0), 0);
  const d = invoice.date ? new Date(invoice.date) : null;

  return (
    <div className="ce-print-doc">
      <header className="ce-print-head">
        <div>
          <h1>CROWN EXCEL ELECTRONICS</h1>
          <p>Enterprise Laptops, Mobile Phones &amp; Gadgets</p>
        </div>
        <div className="ce-print-meta">
          <div className="ce-print-title">INVOICE</div>
          <div className="ce-print-strong">#{invoice.invoiceNo || invoice.id}</div>
          {d && (
            <div>{d.toLocaleDateString()} · {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
          )}
          {invoice.editedBy && (
            <div className="ce-print-edited">Edited by {invoice.editedByName || invoice.editedBy}</div>
          )}
        </div>
      </header>

      <section className="ce-print-parties">
        <div>
          <span className="ce-print-label">Billed To</span>
          <div className="ce-print-strong">{customerPrimaryName(invoice.customer)}</div>
          {customerSecondaryName(invoice.customer) && <div>{customerSecondaryName(invoice.customer)}</div>}
          {invoice.customer?.whatsapp && <div>{invoice.customer.whatsapp}</div>}
          {invoice.customer?.email && <div>{invoice.customer.email}</div>}
        </div>
        <div className="ce-print-right">
          <span className="ce-print-label">Billed By</span>
          <div>{invoice.billedByName || invoice.billedBy || '—'}</div>
          <span className="ce-print-label">Store Location</span>
          <div>{invoice.locationName || invoice.locationId || '—'}</div>
        </div>
      </section>

      <table className="ce-print-table">
        <thead>
          <tr>
            <th>Product &amp; Model</th>
            <th>Serial Numbers</th>
            <th className="ce-print-qty">Qty</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g.key}>
              <td>
                <div className="ce-print-strong">{g.name}</div>
                <div className="ce-print-sub">{g.sku ? `${g.sku} · ` : ''}#{g.barcode} ({g.category})</div>
              </td>
              <td className="ce-print-serials">{g.serials.length ? g.serials.join(', ') : '—'}</td>
              <td className="ce-print-qty">{g.qty}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2} className="ce-print-total-label">Total Units</td>
            <td className="ce-print-qty">{totalUnits}</td>
          </tr>
        </tfoot>
      </table>

      <footer className="ce-print-foot">
        This is a computer-generated invoice. Serial numbers are recorded for warranty registration.
      </footer>
    </div>
  );
};
