import jsPDF from 'jspdf';
import { PublicRiderStatement } from '../types';
import { UnifiedTransactionItem } from './pureLedgerEngine';
import { formatDateDisplay, formatINR, formatPhoneNumber, getTodayDateString } from './formatters';
import { exportFileNativelyOrWeb } from './fileExporter';

export interface RiderLedgerPdfOptions {
  statement: PublicRiderStatement;
  timelineRows: UnifiedTransactionItem[];
  totalPlus: number;
  totalMinus: number;
  netBalance: number;
  balanceStatus: 'rider_due' | 'payable' | 'settled';
  balanceLabel: string;
}

const PAGE_W = 1190; // 2x A4 portrait width (595pt)
const PAGE_H = 1684; // 2x A4 portrait height (842pt)
const MARGIN_X = 52;
const CONTENT_W = PAGE_W - MARGIN_X * 2; // 1086
const TOP_MARGIN = 44;
const BOTTOM_MARGIN = 64;
const FONT_FAMILY =
  "-apple-system, BlinkMacSystemFont, 'Noto Sans Devanagari', 'Noto Sans', 'Segoe UI', Roboto, Arial, sans-serif";

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fillStyle?: string,
  strokeStyle?: string,
  lineWidth: number = 1.5
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();

  if (fillStyle) {
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }
  if (strokeStyle) {
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function wrapTextLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];

  const words = clean.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  const pushWrappedWord = (word: string) => {
    let chunk = '';
    for (let i = 0; i < word.length; i++) {
      const candidate = chunk + word[i];
      if (ctx.measureText(candidate).width <= maxWidth || chunk.length === 0) {
        chunk = candidate;
      } else {
        lines.push(chunk);
        chunk = word[i];
      }
    }
    return chunk;
  };

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
      }
      if (ctx.measureText(word).width <= maxWidth) {
        currentLine = word;
      } else {
        currentLine = pushWrappedWord(word);
      }
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

function createCanvasPage(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = PAGE_W;
  canvas.height = PAGE_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable for PDF export.');
  }
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  ctx.textBaseline = 'top';
  return { canvas, ctx };
}

function drawTableHeader(ctx: CanvasRenderingContext2D, y: number): number {
  const h = 44;
  drawRoundedRect(ctx, MARGIN_X, y, CONTENT_W, h, 0, '#E2E8F0', '#CBD5E1', 1.5);

  ctx.font = `700 16px ${FONT_FAMILY}`;
  ctx.fillStyle = '#1E293B';
  ctx.textAlign = 'left';
  ctx.fillText('तारीख व विवरण (Date & Details)', MARGIN_X + 14, y + 13);

  ctx.textAlign = 'center';
  ctx.fillText('प्रकार', MARGIN_X + 420 + 70, y + 13);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#047857';
  ctx.fillText('कुल कमाई (+)', MARGIN_X + 420 + 140 + 150 - 12, y + 13);

  ctx.fillStyle = '#B91C1C';
  ctx.fillText('कटौती (-)', MARGIN_X + 420 + 140 + 150 + 150 - 12, y + 13);

  ctx.fillStyle = '#1E293B';
  ctx.fillText('चालू बैलेंस', MARGIN_X + CONTENT_W - 14, y + 13);
  ctx.textAlign = 'left';

  return y + h;
}

/**
 * Generates and downloads/shares a multi-page A4 PDF of the Rider Hisab Kitab Ledger
 * with native Devanagari Hindi rendering that works reliably on Web, iFrame, Mobile Browsers,
 * Rider Public Links, and Android Capacitor APKs.
 */
export async function generateRiderLedgerPDF(options: RiderLedgerPdfOptions): Promise<string> {
  const {
    statement,
    timelineRows,
    totalPlus,
    totalMinus,
    netBalance,
    balanceStatus,
    balanceLabel,
  } = options;

  const pages: Array<{ canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }> = [];
  let current = createCanvasPage();
  pages.push(current);

  let y = TOP_MARGIN;
  const hubTitle = (statement.hubName || 'कूरियर डिलीवरी हब').trim();
  const riderName = (statement.riderName || 'राइडर').trim();
  const todayLabel = formatDateDisplay(getTodayDateString());

  // 1. Page 1 Header Banner with multi-color lighting accent bar for "हिसाब किताब"
  drawRoundedRect(current.ctx, MARGIN_X, y, CONTENT_W, 102, 16, '#0F172A');
  const accentGrad = current.ctx.createLinearGradient(MARGIN_X, y, MARGIN_X + CONTENT_W, y);
  accentGrad.addColorStop(0, '#FF3B82');
  accentGrad.addColorStop(0.25, '#FF9900');
  accentGrad.addColorStop(0.5, '#22C55E');
  accentGrad.addColorStop(0.75, '#06B6D4');
  accentGrad.addColorStop(1, '#8B5CF6');
  current.ctx.fillStyle = accentGrad;
  current.ctx.fillRect(MARGIN_X + 20, y + 6, CONTENT_W - 40, 4);

  current.ctx.font = `800 25px ${FONT_FAMILY}`;
  current.ctx.fillStyle = '#FFFFFF';
  current.ctx.textAlign = 'left';
  current.ctx.fillText(hubTitle, MARGIN_X + 24, y + 22);

  const subGrad = current.ctx.createLinearGradient(MARGIN_X + 24, 0, MARGIN_X + 360, 0);
  subGrad.addColorStop(0, '#FF6B9D');
  subGrad.addColorStop(0.35, '#FACC15');
  subGrad.addColorStop(0.7, '#34D399');
  subGrad.addColorStop(1, '#38BDF8');
  current.ctx.font = `800 19px ${FONT_FAMILY}`;
  current.ctx.fillStyle = subGrad;
  current.ctx.fillText('राइडर हिसाब किताब विवरण (Hisab Kitab)', MARGIN_X + 24, y + 58);

  current.ctx.textAlign = 'right';
  current.ctx.font = `700 17px ${FONT_FAMILY}`;
  current.ctx.fillStyle = '#E2E8F0';
  current.ctx.fillText(`दिनांक: ${todayLabel}`, MARGIN_X + CONTENT_W - 24, y + 26);
  current.ctx.font = `600 16px ${FONT_FAMILY}`;
  current.ctx.fillStyle = '#94A3B8';
  current.ctx.fillText(`कुल एंट्री: ${timelineRows.length}`, MARGIN_X + CONTENT_W - 24, y + 58);
  current.ctx.textAlign = 'left';
  y += 120;

  // 2. Rider Info & Balance Card
  const cardH = 112;
  drawRoundedRect(current.ctx, MARGIN_X, y, CONTENT_W, cardH, 14, '#F8FAFC', '#CBD5E1', 1.5);

  // Initial Avatar
  drawRoundedRect(current.ctx, MARGIN_X + 20, y + 22, 68, 68, 14, '#2563EB');
  current.ctx.font = `800 32px ${FONT_FAMILY}`;
  current.ctx.fillStyle = '#FFFFFF';
  current.ctx.textAlign = 'center';
  current.ctx.fillText((riderName.charAt(0) || 'R').toUpperCase(), MARGIN_X + 54, y + 38);

  // Rider Name & Phone
  current.ctx.textAlign = 'left';
  current.ctx.font = `800 25px ${FONT_FAMILY}`;
  current.ctx.fillStyle = '#0F172A';
  current.ctx.fillText(riderName, MARGIN_X + 106, y + 24);

  const cleanPhone = statement.riderPhone ? `+91 ${formatPhoneNumber(statement.riderPhone)}` : '';
  const metaParts = [cleanPhone, statement.vehicleType || 'Bike'].filter(Boolean).join('  •  ');
  current.ctx.font = `600 16px ${FONT_FAMILY}`;
  current.ctx.fillStyle = '#475569';
  current.ctx.fillText(metaParts, MARGIN_X + 106, y + 60);

  // Status Pill on Right
  const pillFill =
    balanceStatus === 'rider_due' ? '#FEE2E2' : balanceStatus === 'payable' ? '#D1FAE5' : '#E2E8F0';
  const pillStroke =
    balanceStatus === 'rider_due' ? '#FCA5A5' : balanceStatus === 'payable' ? '#6EE7B7' : '#CBD5E1';
  const pillText =
    balanceStatus === 'rider_due' ? '#B91C1C' : balanceStatus === 'payable' ? '#047857' : '#1E293B';

  current.ctx.font = `800 19px ${FONT_FAMILY}`;
  const cleanBalanceLabel = balanceLabel.replace(/[🔴🟢⚪]/g, '').trim();
  const balW = Math.min(460, Math.max(250, current.ctx.measureText(cleanBalanceLabel).width + 44));
  drawRoundedRect(current.ctx, MARGIN_X + CONTENT_W - balW - 20, y + 28, balW, 56, 12, pillFill, pillStroke, 1.5);
  current.ctx.fillStyle = pillText;
  current.ctx.textAlign = 'center';
  current.ctx.fillText(cleanBalanceLabel, MARGIN_X + CONTENT_W - balW / 2 - 20, y + 46);
  current.ctx.textAlign = 'left';
  y += cardH + 16;

  // 3. Summary 3-Box Strip
  const gap = 16;
  const boxW = (CONTENT_W - gap * 2) / 3;
  const boxH = 74;

  // Box 1: Total Plus
  drawRoundedRect(current.ctx, MARGIN_X, y, boxW, boxH, 12, '#ECFDF5', '#A7F3D0', 1.5);
  current.ctx.font = `700 15px ${FONT_FAMILY}`;
  current.ctx.fillStyle = '#065F46';
  current.ctx.fillText('कुल कमाई (+)', MARGIN_X + 16, y + 14);
  current.ctx.font = `800 22px ${FONT_FAMILY}`;
  current.ctx.fillStyle = '#047857';
  current.ctx.fillText(`+${formatINR(totalPlus)}`, MARGIN_X + 16, y + 38);

  // Box 2: Total Minus
  const b2X = MARGIN_X + boxW + gap;
  drawRoundedRect(current.ctx, b2X, y, boxW, boxH, 12, '#FEF2F2', '#FECACA', 1.5);
  current.ctx.font = `700 15px ${FONT_FAMILY}`;
  current.ctx.fillStyle = '#991B1B';
  current.ctx.fillText('कुल एडवांस / कटौती (-)', b2X + 16, y + 14);
  current.ctx.font = `800 22px ${FONT_FAMILY}`;
  current.ctx.fillStyle = '#B91C1C';
  current.ctx.fillText(`-${formatINR(totalMinus)}`, b2X + 16, y + 38);

  // Box 3: Net Balance
  const b3X = MARGIN_X + (boxW + gap) * 2;
  drawRoundedRect(current.ctx, b3X, y, boxW, boxH, 12, pillFill, pillStroke, 1.5);
  current.ctx.font = `700 15px ${FONT_FAMILY}`;
  current.ctx.fillStyle = pillText;
  const netTitle =
    balanceStatus === 'rider_due'
      ? 'राइडर से लेना शेष'
      : balanceStatus === 'payable'
      ? 'राइडर को देना शेष'
      : 'अंतिम शेष';
  current.ctx.fillText(netTitle, b3X + 16, y + 14);
  current.ctx.font = `800 22px ${FONT_FAMILY}`;
  current.ctx.fillText(formatINR(netBalance), b3X + 16, y + 38);

  y += boxH + 18;

  // 4. Ledger Table
  y = drawTableHeader(current.ctx, y);

  if (timelineRows.length === 0) {
    drawRoundedRect(current.ctx, MARGIN_X, y, CONTENT_W, 80, 0, '#FFFFFF', '#E2E8F0', 1);
    current.ctx.font = `600 17px ${FONT_FAMILY}`;
    current.ctx.fillStyle = '#64748B';
    current.ctx.textAlign = 'center';
    current.ctx.fillText('इस राइडर के लिए कोई लेनदेन दर्ज नहीं है।', MARGIN_X + CONTENT_W / 2, y + 30);
    current.ctx.textAlign = 'left';
    y += 80;
  } else {
    const col1MaxW = 394;

    timelineRows.forEach((row, index) => {
      current.ctx.font = `700 17px ${FONT_FAMILY}`;
      const titleText = `${row.formattedDate}  •  ${row.title}`;
      const titleLines = wrapTextLines(current.ctx, titleText, col1MaxW);

      current.ctx.font = `500 14.5px ${FONT_FAMILY}`;
      const subLines = row.subTitle ? wrapTextLines(current.ctx, row.subTitle, col1MaxW) : [];

      const titleBlockH = titleLines.length * 22;
      const subBlockH = subLines.length > 0 ? 6 + subLines.length * 19 : 0;
      const rowH = Math.max(66, 24 + titleBlockH + subBlockH);

      // Page break if row doesn't fit
      if (y + rowH > PAGE_H - BOTTOM_MARGIN) {
        current = createCanvasPage();
        pages.push(current);
        y = TOP_MARGIN;

        // Continuation mini-header
        current.ctx.font = `700 18px ${FONT_FAMILY}`;
        current.ctx.fillStyle = '#0F172A';
        current.ctx.textAlign = 'left';
        current.ctx.fillText(`${riderName} — हिसाब किताब (जारी)`, MARGIN_X, y + 6);
        current.ctx.font = `600 15px ${FONT_FAMILY}`;
        current.ctx.fillStyle = '#64748B';
        current.ctx.textAlign = 'right';
        current.ctx.fillText(hubTitle, MARGIN_X + CONTENT_W, y + 8);
        current.ctx.textAlign = 'left';
        y += 38;
        y = drawTableHeader(current.ctx, y);
      }

      const bg = index % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
      drawRoundedRect(current.ctx, MARGIN_X, y, CONTENT_W, rowH, 0, bg, '#E2E8F0', 1);

      // Col 1: Date + Title + SubTitle
      let textY = y + 12;
      current.ctx.textAlign = 'left';
      current.ctx.font = `700 17px ${FONT_FAMILY}`;
      current.ctx.fillStyle = '#0F172A';
      titleLines.forEach((line) => {
        current.ctx.fillText(line, MARGIN_X + 14, textY);
        textY += 22;
      });
      if (subLines.length > 0) {
        textY += 4;
        current.ctx.font = `500 14.5px ${FONT_FAMILY}`;
        current.ctx.fillStyle = '#475569';
        subLines.forEach((line) => {
          current.ctx.fillText(line, MARGIN_X + 14, textY);
          textY += 19;
        });
      }

      // Col 2: Type Badge
      const col2CenterX = MARGIN_X + 420 + 70;
      const isPlus = row.entryKind === 'PLUS_EARNING';
      drawRoundedRect(
        current.ctx,
        col2CenterX - 62,
        y + 13,
        124,
        28,
        14,
        isPlus ? '#ECFDF5' : '#FEF2F2',
        isPlus ? '#A7F3D0' : '#FECACA',
        1
      );
      current.ctx.font = `700 13px ${FONT_FAMILY}`;
      current.ctx.fillStyle = isPlus ? '#047857' : '#B91C1C';
      current.ctx.textAlign = 'center';
      current.ctx.fillText(row.typeLabel || (isPlus ? '(+) कमाई' : '(-) कटौती'), col2CenterX, y + 19);

      if (row.isSettled && (row.type === 'advance' || row.type === 'incentive')) {
        current.ctx.font = `700 12.5px ${FONT_FAMILY}`;
        current.ctx.fillStyle = '#475569';
        current.ctx.fillText('✓ सेटल', col2CenterX, y + 46);
      }

      // Col 3: Plus Amount
      current.ctx.textAlign = 'right';
      current.ctx.font = `700 17px ${FONT_FAMILY}`;
      if (row.plusAmount > 0) {
        current.ctx.fillStyle = '#047857';
        current.ctx.fillText(`+${formatINR(row.plusAmount)}`, MARGIN_X + 420 + 140 + 150 - 12, y + 16);
      } else {
        current.ctx.fillStyle = '#CBD5E1';
        current.ctx.fillText('-', MARGIN_X + 420 + 140 + 150 - 12, y + 16);
      }

      // Col 4: Minus Amount
      if (row.minusAmount > 0) {
        current.ctx.fillStyle = '#B91C1C';
        current.ctx.fillText(`-${formatINR(row.minusAmount)}`, MARGIN_X + 420 + 140 + 150 + 150 - 12, y + 16);
      } else {
        current.ctx.fillStyle = '#CBD5E1';
        current.ctx.fillText('-', MARGIN_X + 420 + 140 + 150 + 150 - 12, y + 16);
      }

      // Col 5: Running Balance
      const cleanRunBal = String(row.runningBalanceLabel || '').replace(/[🔴🟢⚪]/g, '').trim();
      current.ctx.font = `700 15px ${FONT_FAMILY}`;
      current.ctx.fillStyle =
        row.runningBalance < -0.01 ? '#B91C1C' : row.runningBalance > 0.01 ? '#047857' : '#334155';
      current.ctx.fillText(cleanRunBal, MARGIN_X + CONTENT_W - 14, y + 16);
      current.ctx.textAlign = 'left';

      y += rowH;
    });
  }

  // 5. Grand Totals + Separate Final Balance Row + Signature Block
  const footerBlockH = 236;
  if (y + footerBlockH > PAGE_H - BOTTOM_MARGIN) {
    current = createCanvasPage();
    pages.push(current);
    y = TOP_MARGIN;
  }

  // Row A: Column-aligned Totals (short Net value inside Col 5 to prevent any overlap)
  drawRoundedRect(current.ctx, MARGIN_X, y, CONTENT_W, 48, 0, '#F1F5F9', '#94A3B8', 1.5);
  current.ctx.font = `800 17.5px ${FONT_FAMILY}`;
  current.ctx.fillStyle = '#0F172A';
  current.ctx.textAlign = 'left';
  current.ctx.fillText('कुल योग (Grand Totals)', MARGIN_X + 14, y + 15);

  current.ctx.textAlign = 'right';
  current.ctx.fillStyle = '#047857';
  current.ctx.fillText(`+${formatINR(totalPlus)}`, MARGIN_X + 420 + 140 + 150 - 12, y + 15);
  current.ctx.fillStyle = '#B91C1C';
  current.ctx.fillText(`-${formatINR(totalMinus)}`, MARGIN_X + 420 + 140 + 150 + 150 - 12, y + 15);

  const shortNetText =
    balanceStatus === 'rider_due'
      ? `पाना: ${formatINR(netBalance)}`
      : balanceStatus === 'payable'
      ? `देना: ${formatINR(netBalance)}`
      : 'चुकता: ₹0';
  current.ctx.fillStyle = pillText;
  current.ctx.fillText(shortNetText, MARGIN_X + CONTENT_W - 14, y + 15);
  current.ctx.textAlign = 'left';

  y += 48;

  // Row B: Full-width highlighted Final Net Balance row (zero overlap with columns above)
  drawRoundedRect(current.ctx, MARGIN_X, y, CONTENT_W, 52, 0, pillFill, pillStroke, 1.5);
  current.ctx.font = `700 17px ${FONT_FAMILY}`;
  current.ctx.fillStyle = '#334155';
  current.ctx.textAlign = 'left';
  current.ctx.fillText('अंतिम शेष (Final Balance)', MARGIN_X + 14, y + 17);

  current.ctx.font = `800 20px ${FONT_FAMILY}`;
  current.ctx.fillStyle = pillText;
  current.ctx.textAlign = 'right';
  current.ctx.fillText(cleanBalanceLabel, MARGIN_X + CONTENT_W - 14, y + 15);
  current.ctx.textAlign = 'left';

  y += 76;

  // Signature Footer
  current.ctx.strokeStyle = '#CBD5E1';
  current.ctx.lineWidth = 1.5;
  current.ctx.beginPath();
  current.ctx.moveTo(MARGIN_X, y);
  current.ctx.lineTo(MARGIN_X + CONTENT_W, y);
  current.ctx.stroke();

  current.ctx.font = `500 15px ${FONT_FAMILY}`;
  current.ctx.fillStyle = '#475569';
  current.ctx.fillText(
    `यह ${hubTitle} द्वारा जारी किया गया आधिकारिक हिसाब किताब विवरण है।`,
    MARGIN_X,
    y + 18
  );

  current.ctx.font = `700 15px ${FONT_FAMILY}`;
  current.ctx.fillStyle = '#1E293B';
  current.ctx.fillText('राइडर हस्ताक्षर: ________________________', MARGIN_X, y + 66);

  current.ctx.textAlign = 'right';
  current.ctx.fillText('अधिकृत हस्ताक्षर (Hub In-charge): ________________________', MARGIN_X + CONTENT_W, y + 66);
  current.ctx.textAlign = 'left';

  // 6. Add Page Numbers & Build Multi-Page jsPDF
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
    compress: true,
  });

  const pdfW = doc.internal.pageSize.getWidth();
  const pdfH = doc.internal.pageSize.getHeight();
  const previewPages: string[] = [];

  pages.forEach((p, idx) => {
    p.ctx.font = `600 14px ${FONT_FAMILY}`;
    p.ctx.fillStyle = '#94A3B8';
    p.ctx.textAlign = 'center';
    p.ctx.fillText(`पृष्ठ ${idx + 1} / ${pages.length}  •  Courier Rider Hisab Kitab`, PAGE_W / 2, PAGE_H - 36);
    p.ctx.textAlign = 'left';

    if (idx > 0) {
      doc.addPage('a4', 'portrait');
    }
    const imgData = p.canvas.toDataURL('image/jpeg', 0.92);
    previewPages.push(imgData);
    doc.addImage(imgData, 'JPEG', 0, 0, pdfW, pdfH, undefined, 'FAST');
  });

  // Safe ASCII filename for cross-device compatibility (Web + Android FileProvider)
  const asciiName = riderName
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
  const safeSlug = asciiName || statement.riderId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16) || 'Rider';
  const filename = `HisabKitab_${safeSlug}_${getTodayDateString()}.pdf`;

  const dataUri = doc.output('datauristring');
  const base64Data = dataUri.includes(',') ? dataUri.split(',')[1] : dataUri;

  await exportFileNativelyOrWeb({
    filename,
    content: base64Data,
    mimeType: 'application/pdf',
    encoding: 'base64',
    title: `${riderName} - हिसाब किताब (PDF)`,
    text: `${riderName} का हिसाब किताब विवरण (${todayLabel})`,
    dialogTitle: 'PDF हिसाब किताब सेव या शेयर करें',
    previewPages,
  });

  return filename;
}
