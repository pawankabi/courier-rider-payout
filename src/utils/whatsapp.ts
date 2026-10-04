import { formatINR, formatDateDisplay } from './formatters';

export interface WhatsAppSlipData {
  riderName: string;
  phone: string;
  startDate: string;
  endDate: string;
  totalParcels: number;
  baseAmount: number;
  incentiveAmount: number;
  totalAmount: number; // Gross Total
  baseRate?: number;
  incentiveRate?: number;
  advanceAmount?: number;
  advanceDate?: string;
  advanceReason?: string;
  netAmount?: number; // Final Net Amount
  status: 'PAID' | 'UNPAID';
  settledDate?: string;
  daysWorkedCount?: number;
}

export function generateWhatsAppMessage(data: WhatsAppSlipData): string {
  const startFmt = formatDateDisplay(data.startDate);
  const endFmt = formatDateDisplay(data.endDate);
  const periodText = startFmt === endFmt ? startFmt : `${startFmt} to ${endFmt}`;
  const statusEmoji = data.status === 'PAID' ? '✅' : '⏳';
  const settledText = data.settledDate
    ? `\n*Settled At:* ${new Date(data.settledDate).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })}`
    : '';

  const grossTotal = data.totalAmount;
  const advance = data.advanceAmount || 0;
  const netTotal = data.netAmount !== undefined ? data.netAmount : Math.max(0, grossTotal - advance);
  const advanceDateText = advance > 0 && data.advanceDate ? ` (Date: ${formatDateDisplay(data.advanceDate)})` : '';
  const advanceReasonText = advance > 0 && data.advanceReason ? ` [कारण: ${data.advanceReason}]` : '';

  const effBaseRate = data.baseRate ?? (data.totalParcels > 0 ? Math.round(data.baseAmount / data.totalParcels) : 13);
  const effIncRate = data.incentiveRate ?? (data.totalParcels > 0 && data.incentiveAmount > 0 ? Math.round(data.incentiveAmount / data.totalParcels) : 2);

  return (
    `📦 *COURIER RIDER PAYOUT SLIP* 📦\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `👤 *Rider Name:* ${data.riderName}\n` +
    `📱 *WhatsApp:* +91 ${data.phone}\n` +
    `📅 *Period:* ${periodText}\n` +
    (data.daysWorkedCount ? `🗓️ *Days Active:* ${data.daysWorkedCount} days\n` : '') +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📊 *DELIVERY & RATE BREAKDOWN:*\n` +
    `• Total Parcels: *${data.totalParcels} pkts*\n` +
    `• Base Payout: *${formatINR(data.baseAmount)}* (@ ₹${effBaseRate})\n` +
    (data.incentiveAmount > 0 ? `• Total Incentive: *${formatINR(data.incentiveAmount)}* (@ +₹${effIncRate})\n` : '') +
    `• Gross Total: *${formatINR(grossTotal)}*\n` +
    `• Advance Deducted: *${advance > 0 ? `-${formatINR(advance)}` : '₹0'}*${advanceDateText}${advanceReasonText}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `💰 *FINAL NET ${data.status === 'PAID' ? 'PAID' : 'PAYABLE'} AMOUNT:* *${formatINR(netTotal)}*\n` +
    `📌 *PAYMENT STATUS:* ${statusEmoji} *${data.status}*` +
    settledText +
    `\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Thank you for your dedicated courier service! Safe riding. 🛵⚡`
  );
}

export function openWhatsAppSlip(data: WhatsAppSlipData): void {
  const message = generateWhatsAppMessage(data);
  const cleanPhone = data.phone.replace(/\D/g, '');
  const url = `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}
