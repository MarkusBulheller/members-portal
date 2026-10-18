interface PngChartSection {
  title: string;
  data: { name: string; value: number; color: string }[];
  formatValue: (value: number) => string;
}

const WIDTH = 820;
const HEADER_HEIGHT = 64;
const SECTION_PADDING = 30;
const PAD_X = 28;
const ROW_HEIGHT = 40;
const BAR_HEIGHT = 8;
const TITLE_HEIGHT = 34;

// The design's dark surfaces — a PNG is shared outside the portal, so it always uses the dark theme.
const BG = '#151517';
const TRACK = '#26262a';
const INK = '#f5f5f5';
const INK_SOFT = '#d4d4d8';
const MUTED = '#a1a1a8';
const ACCENT_FALLBACK = '#e10600';

/** The accent colour in effect right now (the viewer's chosen accent), for the bar fills. */
function accentColor(): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue('--color-w2w-red').trim();
  return value || ACCENT_FALLBACK;
}

/** Renders one section as the same ranked bar rows the page shows: the name on the left, its
 * share on the right with the raw entry count spelled out, and a bar sized against the section's
 * largest value. Returns the height used so the caller can stack sections without guessing. */
function drawSection(ctx: CanvasRenderingContext2D, top: number, section: PngChartSection, accent: string): number {
  const total = section.data.reduce((sum, d) => sum + d.value, 0);
  const sorted = section.data.slice().sort((a, b) => b.value - a.value);
  const max = sorted.length > 0 ? sorted[0].value : 0;

  // Section title with the design's slanted accent bar.
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(PAD_X + 3, top + 2);
  ctx.lineTo(PAD_X + 8, top + 2);
  ctx.lineTo(PAD_X + 5, top + 20);
  ctx.lineTo(PAD_X + 0, top + 20);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.font = '800 17px Inter, Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(section.title, PAD_X + 20, top + 18);

  let y = top + TITLE_HEIGHT;
  if (total === 0) {
    ctx.fillStyle = MUTED;
    ctx.font = '13px Inter, Arial, sans-serif';
    ctx.fillText('No entries yet.', PAD_X, y + 16);
    return TITLE_HEIGHT + 28;
  }

  const barWidth = WIDTH - PAD_X * 2;
  for (const d of sorted) {
    const pct = Math.round((d.value / total) * 100);

    ctx.fillStyle = INK_SOFT;
    ctx.font = '13px Inter, Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(d.name, PAD_X, y + 13);

    ctx.fillStyle = INK;
    ctx.font = 'italic 900 15px Inter, Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${pct}%`, WIDTH - PAD_X, y + 13);
    const pctWidth = ctx.measureText(`${pct}%`).width;
    ctx.fillStyle = MUTED;
    ctx.font = '12px Inter, Arial, sans-serif';
    ctx.fillText(section.formatValue(d.value), WIDTH - PAD_X - pctWidth - 10, y + 13);
    ctx.textAlign = 'left';

    ctx.fillStyle = TRACK;
    ctx.fillRect(PAD_X, y + 20, barWidth, BAR_HEIGHT);
    ctx.fillStyle = accent;
    ctx.fillRect(PAD_X, y + 20, max === 0 ? 0 : (d.value / max) * barWidth, BAR_HEIGHT);

    y += ROW_HEIGHT;
  }
  return y - top;
}

/** Draws the given chart sections onto an off-DOM canvas (the same numbers the page shows, plus
 * the raw entry count per row) and downloads it as a PNG. A plain canvas render rather than a
 * rasterised copy of the page, so the exported numbers are exact and don't depend on browser
 * SVG-to-image quirks. Resolves to false when the image could not be produced (no 2D context or
 * an empty blob) so the caller can show its own error; never rejects. */
export function exportChartsAsPng(filename: string, heading: string, sections: PngChartSection[]): Promise<boolean> {
  const scale = 2; // export at 2x for a crisp image on high-DPI screens
  const accent = accentColor();
  const measureCanvas = document.createElement('canvas');
  const measureCtx = measureCanvas.getContext('2d');
  if (!measureCtx) return Promise.resolve(false);

  let height = HEADER_HEIGHT;
  for (const section of sections) {
    height += drawSection(measureCtx, 0, section, accent) + SECTION_PADDING;
  }

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve(false);
  ctx.scale(scale, scale);

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, WIDTH, height);

  // Accent line along the top edge, as on the design's highlighted panels.
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, WIDTH, 4);

  ctx.fillStyle = INK;
  ctx.font = '800 22px Inter, Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(heading, PAD_X, 40);

  let top = HEADER_HEIGHT;
  for (const section of sections) {
    top += drawSection(ctx, top, section, accent) + SECTION_PADDING;
  }

  return new Promise<boolean>((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        resolve(false);
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoke on a later tick: some browsers (Safari, older Firefox) cancel the download if the
      // URL is revoked synchronously after click().
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      resolve(true);
    }, 'image/png');
  });
}
