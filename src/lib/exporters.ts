import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export function exportToExcel(filename: string, sheetName: string, rows: Record<string, unknown>[]): void {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export function exportToPdf(
  filename: string,
  title: string,
  subtitle: string,
  columns: { header: string; key: string }[],
  rows: Record<string, unknown>[]
): void {
  const doc = new jsPDF({ orientation: columns.length > 6 ? 'landscape' : 'portrait' });
  doc.setFontSize(14);
  doc.text(`SD Global Logistics — ${title}`, 14, 16);
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(`${subtitle} · Generated ${new Date().toLocaleString()}`, 14, 22);

  autoTable(doc, {
    startY: 28,
    head: [columns.map((c) => c.header)],
    body: rows.map((r) => columns.map((c) => String(r[c.key] ?? '—'))),
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: [29, 78, 216], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  doc.save(`${filename}.pdf`);
}

export function downloadEmployeeImportTemplate(): void {
  const sample = [
    {
      'Full Name': 'Rohan Sharma',
      Mobile: '9876543210',
      Email: 'rohan.sharma@sdgloballogistics.com',
      'Employee Code': 'SDG-1042',
      Designation: 'Warehouse Supervisor',
      Location: 'BWD-WH1',
      Department: 'OPS-WH',
      'Reporting Manager': 'Rajesh Kulkarni',
    },
  ];
  exportToExcel('SDGlobal_Employee_Import_Template', 'Employees', sample);
}
