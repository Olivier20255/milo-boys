import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export function exportToExcel(
  filename: string,
  sheetName: string,
  rows: Array<Record<string, string | number | boolean | null | undefined>>
) {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

export function exportToCSV(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>
) {
  const escape = (val: string | number | null | undefined) => {
    const str = val === null || val === undefined ? '' : String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const csvContent = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportToPDF(
  filename: string,
  title: string,
  subtitle: string,
  headers: string[],
  rows: Array<Array<string | number>>
) {
  const doc = new jsPDF({ orientation: headers.length > 6 ? 'landscape' : 'portrait' });
  doc.setFillColor(15, 37, 87);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 26, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.text('MILO BOYS SCHOOL — INTEGRATED MANAGEMENT SYSTEM', 14, 12);
  doc.setFontSize(10);
  doc.text(title, 14, 20);

  doc.setTextColor(60, 70, 85);
  doc.setFontSize(9);
  doc.text(`${subtitle} · Generated ${new Date().toLocaleDateString('en-KE')}`, 14, 34);

  autoTable(doc, {
    startY: 39,
    head: [headers],
    body: rows,
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: [15, 37, 87], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  doc.save(`${filename}.pdf`);
}
