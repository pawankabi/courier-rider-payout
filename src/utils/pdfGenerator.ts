import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { DeliveryEntry, Rider } from '../types';
import { formatDateDisplay } from './formatters';

export interface PDFReportOptions {
  title?: string;
  riderFilterName: string;
  startDate: string;
  endDate: string;
  entries: DeliveryEntry[];
  advanceAmount?: number;
  advanceDate?: string;
  isSettlementReceipt?: boolean;
  riders?: Rider[];
}

function getDayOfWeek(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const [year, month, day] = dateStr.split('-').map(Number);
    const d = new Date(year, month - 1, day);
    return d.toLocaleDateString('en-IN', { weekday: 'short' });
  } catch {
    return '';
  }
}

export function generatePayoutPDF(options: PDFReportOptions): void {
  const {
    riderFilterName,
    startDate,
    endDate,
    entries,
    advanceAmount = 0,
    advanceDate,
    riders = [],
  } = options;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Brand Palette
  const primaryColor: [number, number, number] = [15, 23, 42]; // Slate 900
  const accentColor: [number, number, number] = [37, 99, 235]; // Blue 600

  // 1. Map assigned sequence and rider lookup
  const riderOrderMap = new Map<string, number>();
  const riderObjMap = new Map<string, Rider>();
  if (riders && riders.length > 0) {
    riders.forEach((r, idx) => {
      riderOrderMap.set(r.id, idx);
      riderObjMap.set(r.id, r);
    });
  }

  // 2. Determine unique riders present in entries
  const distinctRiderIds = Array.from(new Set(entries.map((e) => e.riderId)));

  // Group strictly by assigned sequence / list order (Rider 1, Rider 2, Rider 3...)
  distinctRiderIds.sort((idA, idB) => {
    const orderA = riderOrderMap.has(idA) ? riderOrderMap.get(idA)! : 999999;
    const orderB = riderOrderMap.has(idB) ? riderOrderMap.get(idB)! : 999999;
    if (orderA !== orderB) return orderA - orderB;
    const nameA = entries.find((e) => e.riderId === idA)?.riderName || '';
    const nameB = entries.find((e) => e.riderId === idB)?.riderName || '';
    return nameA.localeCompare(nameB);
  });

  // Calculate overall totals
  const totalParcels = entries.reduce((sum, e) => sum + e.parcels, 0);
  const totalBase = entries.reduce((sum, e) => sum + e.baseAmount, 0);
  const totalIncentive = entries.reduce((sum, e) => sum + e.incentiveAmount, 0);
  const grandTotal = entries.reduce((sum, e) => sum + e.totalEarnings, 0);
  const finalNetTotal = Math.max(0, grandTotal - advanceAmount);
  const totalPaid = entries.filter((e) => e.status === 'Paid').reduce((sum, e) => sum + e.totalEarnings, 0);
  const totalUnpaid = entries.filter((e) => e.status === 'Unpaid').reduce((sum, e) => sum + e.totalEarnings, 0);

  // =========================================================================
  // SCENARIO 1: SINGLE RIDER (or Specific Rider Settlement Receipt)
  // =========================================================================
  if (distinctRiderIds.length <= 1) {
    const riderId = distinctRiderIds[0];
    const riderObj = riderId ? riderObjMap.get(riderId) : undefined;
    const singleRiderName = riderObj?.name || entries[0]?.riderName || riderFilterName;
    const singleRiderPhone = riderObj?.phone || entries[0]?.riderPhone || '';

    // Header Banner
    doc.setFillColor(...primaryColor);
    doc.rect(0, 0, pageWidth, 75, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(17);
    doc.setFont('helvetica', 'bold');
    doc.text('COURIER RIDER PAYOUT & DELIVERY REPORT', 36, 36);

    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(203, 213, 225);
    doc.text('Official Delivery Logistics Hub Statement • Base Rate: Rs 13 | Incentive: Rs 2', 36, 54);

    // Meta block
    doc.setTextColor(51, 65, 85);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated On: ${new Date().toLocaleString('en-IN')}`, 36, 94);
    doc.text(`Period: ${formatDateDisplay(startDate)} to ${formatDateDisplay(endDate)}`, 36, 108);

    const riderDisplay = singleRiderPhone
      ? `${singleRiderName} (Phone: ${singleRiderPhone})`
      : singleRiderName;
    doc.text(`Rider: ${riderDisplay}`, 36, 122);

    if (advanceAmount > 0) {
      const advDateText = advanceDate ? ` (Date: ${formatDateDisplay(advanceDate)})` : '';
      doc.text(`Advance Deducted: Rs. ${advanceAmount.toLocaleString('en-IN')}${advDateText}`, 36, 136);
    }

    // KPI Summary Card Block
    const startY = advanceAmount > 0 ? 146 : 138;
    const cardW = (pageWidth - 72 - 36) / 4;
    const cardH = 46;

    const kpis = advanceAmount > 0
      ? [
          { label: 'TOTAL PARCELS', value: `${totalParcels.toLocaleString('en-IN')}`, color: [15, 23, 42] as [number, number, number] },
          { label: 'GROSS TOTAL', value: `Rs. ${grandTotal.toLocaleString('en-IN')}`, color: [15, 23, 42] as [number, number, number] },
          { label: 'ADVANCE DEDUCTED', value: `-Rs. ${advanceAmount.toLocaleString('en-IN')}`, color: [185, 28, 28] as [number, number, number] },
          { label: 'FINAL NET TOTAL', value: `Rs. ${finalNetTotal.toLocaleString('en-IN')}`, color: [16, 122, 68] as [number, number, number] },
        ]
      : [
          { label: 'TOTAL PARCELS', value: `${totalParcels.toLocaleString('en-IN')}`, color: [15, 23, 42] as [number, number, number] },
          { label: 'BASE PAYOUT', value: `Rs. ${totalBase.toLocaleString('en-IN')}`, color: [15, 23, 42] as [number, number, number] },
          { label: 'INCENTIVES', value: `Rs. ${totalIncentive.toLocaleString('en-IN')}`, color: [15, 23, 42] as [number, number, number] },
          { label: 'GRAND TOTAL', value: `Rs. ${grandTotal.toLocaleString('en-IN')}`, color: [37, 99, 235] as [number, number, number] },
        ];

    kpis.forEach((kpi, idx) => {
      const x = 36 + idx * (cardW + 12);
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(x, startY, cardW, cardH, 4, 4, 'FD');

      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(100, 116, 139);
      doc.text(kpi.label, x + 8, startY + 16);

      doc.setFontSize(11.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
      doc.text(kpi.value, x + 8, startY + 36);
    });

    // Secondary settlement summary text
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(
      `Settlement Status: Paid Rs. ${totalPaid.toLocaleString('en-IN')}  |  Unpaid Rs. ${totalUnpaid.toLocaleString('en-IN')}  |  Total Delivery Days: ${entries.length}`,
      36,
      startY + cardH + 18
    );

    // SORT STRICTLY IN ASCENDING CHRONOLOGICAL ORDER: Oldest to Newest (Start Date to End Date)
    const sortedEntries = [...entries].sort((a, b) => a.date.localeCompare(b.date));

    // Table rows
    const tableRows = sortedEntries.map((entry, index) => {
      const dayName = getDayOfWeek(entry.date);
      const baseRate = entry.baseRate || 13;
      return [
        (index + 1).toString(),
        formatDateDisplay(entry.date),
        dayName,
        entry.parcels.toString(),
        `Rs. ${baseRate}`,
        `Rs. ${entry.baseAmount.toLocaleString('en-IN')}`,
        entry.hasIncentive ? `+Rs. ${entry.incentiveAmount.toLocaleString('en-IN')} (Yes)` : 'Rs. 0 (No)',
        `Rs. ${entry.totalEarnings.toLocaleString('en-IN')}`,
        entry.status,
      ];
    });

    autoTable(doc, {
      startY: startY + cardH + 26,
      head: [['#', 'Date', 'Day', 'Parcels', 'Rate', 'Base Pay', 'Incentive', 'Total Pay', 'Status']],
      body: tableRows,
      foot: [
        [
          'TOTAL',
          `${sortedEntries.length} Days`,
          '',
          `${totalParcels} pkts`,
          '',
          `Rs. ${totalBase.toLocaleString('en-IN')}`,
          `+Rs. ${totalIncentive.toLocaleString('en-IN')}`,
          `Rs. ${grandTotal.toLocaleString('en-IN')}`,
          totalUnpaid > 0 ? `Unpaid: Rs. ${totalUnpaid.toLocaleString('en-IN')}` : 'All Paid',
        ],
      ],
      theme: 'grid',
      headStyles: {
        fillColor: accentColor,
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: 'bold',
        halign: 'center',
        cellPadding: 4.5,
      },
      bodyStyles: {
        fontSize: 7.5,
        textColor: [30, 41, 59],
        cellPadding: 4,
      },
      footStyles: {
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        fontSize: 8,
        fontStyle: 'bold',
        halign: 'center',
        cellPadding: 4.5,
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 22 },
        1: { halign: 'center', cellWidth: 68 },
        2: { halign: 'center', cellWidth: 35 },
        3: { halign: 'center', cellWidth: 50 },
        4: { halign: 'right', cellWidth: 42 },
        5: { halign: 'right', cellWidth: 62 },
        6: { halign: 'center', cellWidth: 74 },
        7: { halign: 'right', fontStyle: 'bold', cellWidth: 70 },
        8: { halign: 'center', cellWidth: 55 },
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      margin: { left: 36, right: 36 },
    });

    // Summary box below the table
    const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || (startY + cardH + 200);
    let summaryY = finalY + 14;
    if (summaryY + 95 > pageHeight - 35) {
      doc.addPage();
      summaryY = 40;
    }

    const boxW = 240;
    const boxH = advanceAmount > 0 ? 76 : 52;
    const boxX = pageWidth - 36 - boxW;

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(boxX, summaryY, boxW, boxH, 4, 4, 'FD');

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text('Gross Delivery Total:', boxX + 12, summaryY + 16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`Rs. ${grandTotal.toLocaleString('en-IN')}`, boxX + boxW - 12, summaryY + 16, { align: 'right' });

    if (advanceAmount > 0) {
      const advDateText = advanceDate ? ` (${formatDateDisplay(advanceDate)})` : '';
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(185, 28, 28);
      doc.text(`Advance Deducted${advDateText}:`, boxX + 12, summaryY + 34);
      doc.setFont('helvetica', 'bold');
      doc.text(`- Rs. ${advanceAmount.toLocaleString('en-IN')}`, boxX + boxW - 12, summaryY + 34, { align: 'right' });

      doc.setDrawColor(203, 213, 225);
      doc.line(boxX + 10, summaryY + 44, boxX + boxW - 10, summaryY + 44);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(16, 122, 68);
      doc.text('Final Net Total:', boxX + 12, summaryY + 62);
      doc.text(`Rs. ${finalNetTotal.toLocaleString('en-IN')}`, boxX + boxW - 12, summaryY + 62, { align: 'right' });
    } else {
      doc.setDrawColor(203, 213, 225);
      doc.line(boxX + 10, summaryY + 26, boxX + boxW - 10, summaryY + 26);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(37, 99, 235);
      doc.text('Final Net Total:', boxX + 12, summaryY + 42);
      doc.text(`Rs. ${grandTotal.toLocaleString('en-IN')}`, boxX + boxW - 12, summaryY + 42, { align: 'right' });
    }

    // Signatures
    const sigY = summaryY + boxH + 16;
    if (sigY + 20 <= pageHeight - 35) {
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(148, 163, 184);
      doc.text('Rider Signature: _______________________', 36, sigY);
      doc.text('Hub In-Charge / Supervisor: _______________________', pageWidth - 36, sigY, { align: 'right' });
    }
  } else {
    // =========================================================================
    // SCENARIO 2: MULTI-RIDER ("All Riders" or Multiple Selected Delivery Boys)
    // Page 1: Hub Executive Summary & Master Roster Table
    // Subsequent Pages: Each Rider in Sequence, Oldest to Newest date, Subtotal
    // =========================================================================

    // PAGE 1: MASTER HUB SUMMARY
    doc.setFillColor(...primaryColor);
    doc.rect(0, 0, pageWidth, 75, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(17);
    doc.setFont('helvetica', 'bold');
    doc.text('COURIER RIDER PAYOUT & DELIVERY REPORT', 36, 36);

    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(203, 213, 225);
    doc.text('Official Delivery Logistics Hub Statement • Multi-Rider Summary & Audit Schedule', 36, 54);

    // Meta block
    doc.setTextColor(51, 65, 85);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated On: ${new Date().toLocaleString('en-IN')}`, 36, 94);
    doc.text(`Period: ${formatDateDisplay(startDate)} to ${formatDateDisplay(endDate)}`, 36, 108);
    doc.text(`Rider Scope: ${riderFilterName} (${distinctRiderIds.length} Delivery Boys in Assigned Order)`, 36, 122);

    // 4 Hub KPI Summary Cards
    const startY = 138;
    const cardW = (pageWidth - 72 - 36) / 4;
    const cardH = 46;

    const kpis = [
      { label: 'TOTAL HUB PARCELS', value: `${totalParcels.toLocaleString('en-IN')}`, color: [15, 23, 42] as [number, number, number] },
      { label: 'BASE PAYOUT', value: `Rs. ${totalBase.toLocaleString('en-IN')}`, color: [15, 23, 42] as [number, number, number] },
      { label: 'TOTAL INCENTIVES', value: `Rs. ${totalIncentive.toLocaleString('en-IN')}`, color: [15, 23, 42] as [number, number, number] },
      { label: 'HUB GRAND TOTAL', value: `Rs. ${grandTotal.toLocaleString('en-IN')}`, color: [37, 99, 235] as [number, number, number] },
    ];

    kpis.forEach((kpi, idx) => {
      const x = 36 + idx * (cardW + 12);
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(x, startY, cardW, cardH, 4, 4, 'FD');

      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(100, 116, 139);
      doc.text(kpi.label, x + 8, startY + 16);

      doc.setFontSize(11.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
      doc.text(kpi.value, x + 8, startY + 36);
    });

    // Secondary settlement summary text
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(
      `Hub Settlement Status: Total Paid: Rs. ${totalPaid.toLocaleString('en-IN')}  |  Unpaid: Rs. ${totalUnpaid.toLocaleString('en-IN')}  |  Total Delivery Records: ${entries.length}`,
      36,
      startY + cardH + 18
    );

    // Section title for Roster Table
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('RIDER PAYOUT ROSTER (ASSIGNED SEQUENCE ORDER)', 36, startY + cardH + 34);

    // Master Roster Table Rows
    const rosterRows = distinctRiderIds.map((riderId, index) => {
      const rEntries = entries.filter((e) => e.riderId === riderId);
      const rParcels = rEntries.reduce((sum, e) => sum + e.parcels, 0);
      const rBase = rEntries.reduce((sum, e) => sum + e.baseAmount, 0);
      const rInc = rEntries.reduce((sum, e) => sum + e.incentiveAmount, 0);
      const rGross = rEntries.reduce((sum, e) => sum + e.totalEarnings, 0);
      const rUnpaid = rEntries.filter((e) => e.status === 'Unpaid').reduce((sum, e) => sum + e.totalEarnings, 0);

      const rObj = riderObjMap.get(riderId);
      const rName = rObj?.name || rEntries[0]?.riderName || 'Rider';
      const rPhone = rObj?.phone || rEntries[0]?.riderPhone || 'N/A';

      return [
        (index + 1).toString(),
        rName,
        rPhone,
        `${rEntries.length} Days`,
        rParcels.toLocaleString('en-IN'),
        `Rs. ${rBase.toLocaleString('en-IN')}`,
        `+Rs. ${rInc.toLocaleString('en-IN')}`,
        `Rs. ${rGross.toLocaleString('en-IN')}`,
        rUnpaid > 0 ? `Unpaid: Rs. ${rUnpaid.toLocaleString('en-IN')}` : 'Fully Paid',
      ];
    });

    autoTable(doc, {
      startY: startY + cardH + 42,
      head: [['#', 'Rider Name', 'Phone', 'Days', 'Parcels', 'Base Pay', 'Incentives', 'Gross Total', 'Status']],
      body: rosterRows,
      foot: [
        [
          'TOTAL',
          `${distinctRiderIds.length} Riders`,
          '',
          `${entries.length} Entries`,
          totalParcels.toLocaleString('en-IN'),
          `Rs. ${totalBase.toLocaleString('en-IN')}`,
          `+Rs. ${totalIncentive.toLocaleString('en-IN')}`,
          `Rs. ${grandTotal.toLocaleString('en-IN')}`,
          totalUnpaid > 0 ? `Unpaid: Rs. ${totalUnpaid.toLocaleString('en-IN')}` : 'All Paid',
        ],
      ],
      theme: 'grid',
      headStyles: {
        fillColor: accentColor,
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: 'bold',
        halign: 'center',
        cellPadding: 4,
      },
      bodyStyles: {
        fontSize: 7.5,
        textColor: [30, 41, 59],
        cellPadding: 4,
      },
      footStyles: {
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        fontSize: 8,
        fontStyle: 'bold',
        halign: 'center',
        cellPadding: 4,
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 22 },
        1: { halign: 'left', fontStyle: 'bold', cellWidth: 110 },
        2: { halign: 'center', cellWidth: 68 },
        3: { halign: 'center', cellWidth: 38 },
        4: { halign: 'center', cellWidth: 48 },
        5: { halign: 'right', cellWidth: 60 },
        6: { halign: 'right', cellWidth: 56 },
        7: { halign: 'right', fontStyle: 'bold', cellWidth: 66 },
        8: { halign: 'center', cellWidth: 55 },
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      margin: { left: 36, right: 36 },
    });

    // Helper text below roster
    const rosterFinalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || (startY + cardH + 160);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(100, 116, 139);
    doc.text('Individual day-by-day chronological statements for each rider are detailed on the following pages.', 36, rosterFinalY + 16);

    // =========================================================================
    // DETAILED INDIVIDUAL RIDER SECTIONS (In Strict Assigned Sequence Order)
    // =========================================================================
    let currentY = 40;

    distinctRiderIds.forEach((riderId, riderIndex) => {
      // Filter entries for this specific rider
      // CHRONOLOGICAL ASCENDING SORT: Oldest to Newest (Start Date to End Date)
      const rEntries = entries
        .filter((e) => e.riderId === riderId)
        .sort((a, b) => a.date.localeCompare(b.date));

      const rParcels = rEntries.reduce((sum, e) => sum + e.parcels, 0);
      const rBase = rEntries.reduce((sum, e) => sum + e.baseAmount, 0);
      const rIncentive = rEntries.reduce((sum, e) => sum + e.incentiveAmount, 0);
      const rGross = rEntries.reduce((sum, e) => sum + e.totalEarnings, 0);
      const rPaid = rEntries.filter((e) => e.status === 'Paid').reduce((sum, e) => sum + e.totalEarnings, 0);
      const rUnpaid = rEntries.filter((e) => e.status === 'Unpaid').reduce((sum, e) => sum + e.totalEarnings, 0);

      const rObj = riderObjMap.get(riderId);
      const riderName = rObj?.name || rEntries[0]?.riderName || `Rider ${riderIndex + 1}`;
      const riderPhone = rObj?.phone || rEntries[0]?.riderPhone || 'N/A';

      // Decide whether to start a new page or draw a prominent section divider
      if (riderIndex === 0) {
        // First rider starts cleanly on Page 2 after Master Roster
        doc.addPage();
        currentY = 40;
      } else {
        // Subsequent riders:
        // If rider has >= 6 entries OR remaining vertical height is < 260pt, start fresh page
        if (rEntries.length >= 6 || (pageHeight - currentY) < 260) {
          doc.addPage();
          currentY = 40;
        } else {
          // Clean, prominent section divider line with accent marker
          currentY += 16;
          doc.setDrawColor(203, 213, 225);
          doc.setLineWidth(1);
          doc.line(36, currentY, pageWidth - 36, currentY);

          doc.setFillColor(...accentColor);
          doc.circle(pageWidth / 2, currentY, 3, 'F');
          currentY += 16;
        }
      }

      // Rider Section Header Banner
      const bannerH = 32;
      doc.setFillColor(30, 41, 59); // Slate 800
      doc.roundedRect(36, currentY, pageWidth - 72, bannerH, 4, 4, 'F');

      // Left blue accent indicator
      doc.setFillColor(...accentColor);
      doc.roundedRect(36, currentY, 5, bannerH, 2, 2, 'F');

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text(`RIDER #${riderIndex + 1} OF ${distinctRiderIds.length}: ${riderName.toUpperCase()}`, 48, currentY + 14);

      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(203, 213, 225);
      doc.text(
        `Phone: ${riderPhone}  •  Period: ${formatDateDisplay(startDate)} to ${formatDateDisplay(endDate)}  •  ${rEntries.length} Active Days`,
        48,
        currentY + 25
      );

      // Subtotal badge on top-right of banner
      doc.setFontSize(9.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(52, 211, 153); // Emerald 400
      doc.text(`Subtotal: Rs. ${rGross.toLocaleString('en-IN')}`, pageWidth - 48, currentY + 19, { align: 'right' });

      currentY += bannerH + 8;

      // Table rows for this rider (Ascending chronological: Oldest to Newest)
      const tableRows = rEntries.map((entry, idx) => {
        const dayName = getDayOfWeek(entry.date);
        const baseRate = entry.baseRate || 13;
        return [
          (idx + 1).toString(),
          formatDateDisplay(entry.date),
          dayName,
          entry.parcels.toString(),
          `Rs. ${baseRate}`,
          `Rs. ${entry.baseAmount.toLocaleString('en-IN')}`,
          entry.hasIncentive ? `+Rs. ${entry.incentiveAmount.toLocaleString('en-IN')} (Yes)` : 'Rs. 0 (No)',
          `Rs. ${entry.totalEarnings.toLocaleString('en-IN')}`,
          entry.status,
        ];
      });

      autoTable(doc, {
        startY: currentY,
        head: [['#', 'Date', 'Day', 'Parcels', 'Rate', 'Base Pay', 'Incentive', 'Total Pay', 'Status']],
        body: tableRows,
        foot: [
          [
            'TOTAL',
            `${rEntries.length} Days`,
            '',
            `${rParcels} pkts`,
            '',
            `Rs. ${rBase.toLocaleString('en-IN')}`,
            `+Rs. ${rIncentive.toLocaleString('en-IN')}`,
            `Rs. ${rGross.toLocaleString('en-IN')}`,
            rUnpaid > 0 ? `Unpaid: Rs. ${rUnpaid.toLocaleString('en-IN')}` : 'All Paid',
          ],
        ],
        theme: 'grid',
        headStyles: {
          fillColor: accentColor,
          textColor: [255, 255, 255],
          fontSize: 8,
          fontStyle: 'bold',
          halign: 'center',
          cellPadding: 4,
        },
        bodyStyles: {
          fontSize: 7.5,
          textColor: [30, 41, 59],
          cellPadding: 4,
        },
        footStyles: {
          fillColor: [241, 245, 249],
          textColor: [15, 23, 42],
          fontSize: 8,
          fontStyle: 'bold',
          halign: 'center',
          cellPadding: 4,
        },
        columnStyles: {
          0: { halign: 'center', cellWidth: 22 },
          1: { halign: 'center', cellWidth: 68 },
          2: { halign: 'center', cellWidth: 35 },
          3: { halign: 'center', cellWidth: 50 },
          4: { halign: 'right', cellWidth: 42 },
          5: { halign: 'right', cellWidth: 62 },
          6: { halign: 'center', cellWidth: 74 },
          7: { halign: 'right', fontStyle: 'bold', cellWidth: 70 },
          8: { halign: 'center', cellWidth: 55 },
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
        margin: { left: 36, right: 36 },
      });

      // Subtotal card below rider table
      const lastTableY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || (currentY + 100);
      let subY = lastTableY + 8;

      if (subY + 75 > pageHeight - 35) {
        doc.addPage();
        subY = 40;
      }

      const subBoxW = pageWidth - 72;
      const subBoxH = 44;

      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(36, subY, subBoxW, subBoxH, 4, 4, 'FD');

      const colW = subBoxW / 4;
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(100, 116, 139);

      doc.text('DELIVERED PARCELS', 44, subY + 13);
      doc.text('BASE EARNINGS', 44 + colW, subY + 13);
      doc.text('INCENTIVES (+Rs 2)', 44 + colW * 2, subY + 13);
      doc.text('RIDER GROSS TOTAL', 44 + colW * 3, subY + 13);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(`${rParcels.toLocaleString('en-IN')} pkts`, 44, subY + 30);
      doc.text(`Rs. ${rBase.toLocaleString('en-IN')}`, 44 + colW, subY + 30);
      doc.text(`Rs. ${rIncentive.toLocaleString('en-IN')}`, 44 + colW * 2, subY + 30);

      doc.setTextColor(...accentColor);
      doc.text(`Rs. ${rGross.toLocaleString('en-IN')}`, 44 + colW * 3, subY + 30);

      // Status text
      doc.setFontSize(7.5);
      if (rUnpaid > 0) {
        doc.setTextColor(180, 83, 9);
        doc.text(`Pending Due: Rs. ${rUnpaid.toLocaleString('en-IN')}`, pageWidth - 44, subY + 38, { align: 'right' });
      } else {
        doc.setTextColor(16, 122, 68);
        doc.text('Status: Fully Paid', pageWidth - 44, subY + 38, { align: 'right' });
      }

      // Signature line for physical sign-off
      subY += subBoxH + 12;
      if (subY + 22 <= pageHeight - 35) {
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(148, 163, 184);
        doc.text('Rider Signature: _______________________', 44, subY + 8);
        doc.text('Hub In-Charge / Supervisor: _______________________', pageWidth - 44, subY + 8, { align: 'right' });
        currentY = subY + 18;
      } else {
        currentY = subY;
      }
    });
  }

  // Add consistent Page Numbering across all generated pages
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184);
    const footerStr = `Page ${p} of ${totalPages} • Courier Rider Operations Hub`;
    doc.text(footerStr, pageWidth / 2, pageHeight - 18, { align: 'center' });
  }

  // Save the PDF
  const cleanScope = riderFilterName.replace(/[^a-zA-Z0-9]/g, '_');
  const filename = `Courier_Payout_${cleanScope}_${startDate}_to_${endDate}.pdf`;
  doc.save(filename);
}
