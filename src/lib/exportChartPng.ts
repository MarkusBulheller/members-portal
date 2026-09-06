interface PngChartSection {
  title: string;
  data: { name: string; value: number; color: string }[];
  formatValue: (value: number) => string;
}

const WIDTH = 820;
const HEADER_HEIGHT = 56;
const SECTION_PADDING = 28;
const LEGEND_ROW_HEIGHT = 22;
const DONUT_CX = 130;
const DONUT_OUTER_R = 88;
const DONUT_INNER_R = 54;

function drawDonut(ctx: CanvasRenderingContext2D, cx: number, cy: number, data: PngChartSection['data'], total: number) {
  if (total === 0) {
    ctx.fillStyle = 'rgba(245,245,245,0.5)';
    ctx.font = '13px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No entries yet.', cx, cy);
    ctx.textAlign = 'left';
    return;
  }

  let startAngle = -Math.PI / 2;
  for (const d of data) {
    const angle = (d.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, DONUT_OUTER_R, startAngle, startAngle + angle);
    ctx.closePath();
    ctx.fillStyle = d.color;
    ctx.fill();
    startAngle += angle;
  }

  // Punch the donut hole out of the pie wedges just drawn.
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(cx, cy, DONUT_INNER_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
}

/** Renders one chart section (a donut + a legend that spells out each slice's real entry count,
 * not just its share) onto the canvas at the given top offset, mirroring DriverShareChart's
 * layout. Returns the total height the section actually used, so the caller can stack sections
 * without guessing. */
function drawSection(ctx: CanvasRenderingContext2D, top: number, section: PngChartSection): number {
  const total = section.data.reduce((sum, d) => sum + d.value, 0);
  const sorted = section.data.slice().sort((a, b) => b.value - a.value);

  ctx.fillStyle = '#f5f5f5';
  ctx.font = 'bold 13px Arial, sans-serif';
  ctx.fillText(section.title.toUpperCase(), 24, top + 16);

  const donutCy = top + 40 + DONUT_OUTER_R;
  drawDonut(ctx, DONUT_CX, donutCy, section.data, total);

  const legendX = 260;
  let legendY = top + 46;
  for (const d of sorted) {
    const pct = total === 0 ? 0 : Math.round((d.value / total) * 100);
    ctx.fillStyle = d.color;
    ctx.fillRect(legendX, legendY - 11, 12, 12);
    ctx.fillStyle = '#f5f5f5';
    ctx.font = '13px Arial, sans-serif';
    ctx.fillText(`${d.name} — ${section.formatValue(d.value)} (${pct}%)`, legendX + 20, legendY);
    legendY += LEGEND_ROW_HEIGHT;
  }

  const donutBottom = top + 40 + DONUT_OUTER_R * 2;
  const legendBottom = legendY;
  return Math.max(donutBottom, legendBottom) - top;
}

/** Draws the given chart sections onto an off-DOM canvas (same numbers DriverShareChart is
 * already showing on screen, plus the raw entry count spelled out per slice) and downloads it as
 * a PNG. Built as a plain canvas render rather than rasterizing the live Recharts SVGs, so the
 * exported numbers are exact and don't depend on browser SVG-to-image quirks. */
export function exportChartsAsPng(filename: string, heading: string, sections: PngChartSection[]): void {
  const scale = 2; // export at 2x for a crisp image on high-DPI screens
  const measureCanvas = document.createElement('canvas');
  const measureCtx = measureCanvas.getContext('2d');
  if (!measureCtx) return;

  let height = HEADER_HEIGHT;
  for (const section of sections) {
    measureCtx.font = '13px Arial, sans-serif';
    height += drawSection(measureCtx, 0, section) + SECTION_PADDING;
  }

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(scale, scale);

  ctx.fillStyle = '#0a0a0b';
  ctx.fillRect(0, 0, WIDTH, height);

  ctx.fillStyle = '#f5f5f5';
  ctx.font = 'bold 18px Arial, sans-serif';
  ctx.fillText(heading, 24, 32);

  let top = HEADER_HEIGHT;
  for (const section of sections) {
    top += drawSection(ctx, top, section) + SECTION_PADDING;
  }

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, 'image/png');
}
