import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { isLow, type Snapshot } from "@stocket/core";

export function inventoryPdf(data: Snapshot) {
  const pdf = new jsPDF(),
    active = data.items.filter((i) => !i.archived_at);
  const low = active.filter(isLow).length,
    units = active.reduce((n, i) => n + i.quantity, 0);
  const date = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const header = () => {
    pdf.setFillColor("#334EAC");
    pdf.rect(0, 0, 210, 43, "F");
    pdf.setTextColor("#FFF9F0");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(24);
    pdf.text("stocket.", 16, 19);
    pdf.setFontSize(11);
    pdf.setFont("helvetica", "normal");
    pdf.text("A little order, everywhere.", 16, 29);
    pdf.setFontSize(10);
    pdf.text("INVENTORY REPORT", 194, 18, { align: "right" });
    pdf.text(date, 194, 28, { align: "right" });
  };
  header();
  pdf.setTextColor("#102B53");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(17);
  const companyLines = pdf.splitTextToSize(data.company.name, 178);
  pdf.text(companyLines, 16, 56);
  const summaryY = 61 + companyLines.length * 7;
  for (const [index, [value, label]] of [
    [active.length, "Supplies"],
    [units, "Units in stock"],
    [low, "Need a top-up"],
  ].entries()) {
    const x = 16 + index * 61;
    pdf.setFillColor(index === 2 ? "#FFF1E6" : "#F0F6FB");
    pdf.roundedRect(x, summaryY, 56, 22, 3, 3, "F");
    pdf.setTextColor(index === 2 ? "#B95027" : "#334EAC");
    pdf.setFontSize(16);
    pdf.setFont("helvetica", "bold");
    pdf.text(String(value), x + 5, summaryY + 9);
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "normal");
    pdf.text(String(label), x + 5, summaryY + 16);
  }
  autoTable(pdf, {
    startY: summaryY + 31,
    margin: { left: 16, right: 16, top: 52, bottom: 22 },
    head: [["SUPPLY", "CATEGORY", "IN STOCK", "THRESHOLD", "STATUS"]],
    body: active.map((item) => {
      const catalog = data.catalog.find((c) => c.id === item.catalog_item_id);
      return [
        catalog?.name ?? "Supply",
        data.categories.find((c) => c.id === catalog?.category_id)?.name ??
          "Supplies",
        String(item.quantity),
        String(item.low_stock_threshold),
        isLow(item) ? "Low stock" : "In stock",
      ];
    }),
    theme: "grid",
    styles: {
      fontSize: 10,
      cellPadding: 4,
      lineColor: [229, 232, 233],
      lineWidth: 0.15,
      textColor: [16, 43, 83],
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [51, 78, 172],
      textColor: 255,
      fontSize: 8,
      fontStyle: "bold",
      cellPadding: 4,
    },
    alternateRowStyles: { fillColor: [245, 248, 252] },
    columnStyles: {
      0: { cellWidth: 57, fontStyle: "bold" },
      1: { cellWidth: 41 },
      2: { cellWidth: 24, halign: "right" },
      3: { cellWidth: 27, halign: "right" },
      4: { cellWidth: 29 },
    },
    rowPageBreak: "avoid",
    didParseCell: (cell) => {
      if (cell.section === "body" && cell.column.index === 4) {
        cell.cell.styles.textColor =
          cell.cell.raw === "Low stock" ? [185, 80, 39] : [51, 78, 172];
        cell.cell.styles.fontStyle = "bold";
      }
    },
    willDrawPage: header,
  });
  if (!active.length) {
    pdf.setFontSize(11);
    pdf.setTextColor("#69788D");
    pdf.text(
      "No active supplies yet. Add an item to start your stock report.",
      16,
      summaryY + 54,
    );
  }
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page);
    pdf.setDrawColor("#BAD6EB");
    pdf.line(16, 279, 194, 279);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor("#69788D");
    pdf.text(
      "Low stock means quantity is below its threshold. Active supplies only.",
      16,
      285,
    );
    pdf.text(`${page} / ${pages}`, 194, 285, { align: "right" });
  }
  return pdf;
}
