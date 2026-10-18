import { formatShortDate } from '../lib/formatShortDate';
import { formatLapTime, guessRaceLength } from '../lib/lapTime';
import { buildDriverColorMap } from '../lib/stints';
import type { RaceResult } from '../types/raceResult';

function positionLabel(position: number | null): string {
  return position === null ? '—' : `P${position}`;
}

// Fixed dark-mode-only hex, NOT the shared theme-aware podiumColor() from lib/podium.ts — this
// card is a static branded image meant to look identical however it's exported, so it shouldn't
// follow the viewer's current light/dark preference the way on-page UI does.
const SHARE_CARD_PODIUM_COLORS: Record<number, string> = {
  1: '#e8c34a',
  2: '#c7cbd1',
  3: '#cd8a4e',
};

function sharedCardPositionColor(position: number | null, fallback: string): string {
  if (position === null) return fallback;
  return SHARE_CARD_PODIUM_COLORS[position] ?? fallback;
}

/** Self-contained summary card designed to be exported as a standalone PNG (see
 * RaceResultDetailPage's "Export" button) — deliberately not just the results page itself,
 * since a dense table of expandable stints doesn't make a good shareable image. Fixed width,
 * auto height (a full endurance lineup can be 4-6+ drivers, so a fixed height clips the list —
 * confirmed from a real export). Kept off-screen in the live DOM (not display:none, which
 * html-to-image can't capture) and rendered to a canvas on export.
 *
 * Styled to match the portal's design (dark panel, accent stripe, medal, inset tiles) but with
 * plain inline hex and no clip-path: the angled corner cuts the live UI uses are CSS clip-paths,
 * which html-to-image's SVG foreignObject render doesn't reliably reproduce, so the card keeps
 * square corners and the same colours instead. */
export default function RaceResultShareCard({ result }: { result: RaceResult }) {
  const durationMs =
    result.startTime && result.endTime
      ? new Date(result.endTime).getTime() - new Date(result.startTime).getTime()
      : null;
  const driverColors = buildDriverColorMap(result.driverStints.map((d) => d.iracingCustId));
  const finishPosition = result.finishingPositionInClass ?? result.finishingPosition;
  const hasMedal = finishPosition !== null && SHARE_CARD_PODIUM_COLORS[finishPosition] !== undefined;
  const medal = sharedCardPositionColor(finishPosition, '#26262a');

  const subline = [
    result.teamName,
    result.carName,
    result.totalSplits && result.totalSplits > 1 ? `Split ${result.splitNumber}/${result.totalSplits}` : null,
    result.startTime
      ? formatShortDate(result.startTime, true)
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      style={{
        position: 'relative',
        width: 1000,
        background: '#151517',
        color: '#f5f5f5',
        fontFamily: "'Inter', Arial, sans-serif",
        padding: '44px 210px 36px 44px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Accent stripe on the right edge — same angled bands as the on-page hero. */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          width: 170,
          background:
            'linear-gradient(110deg, transparent 0 28%, #e10600 28% 40%, transparent 40% 50%, #e10600 50% 100%)',
        }}
      />

      <div
        style={{
          position: 'relative',
          fontFamily: "'Orbitron', 'Inter', sans-serif",
          fontSize: 22,
          fontWeight: 900,
          letterSpacing: 3,
          textTransform: 'uppercase',
        }}
      >
        W<span style={{ color: '#e10600' }}>2</span>W Racing
      </div>

      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 26, marginTop: 28 }}>
        <div
          style={{
            width: 120,
            height: 120,
            flex: 'none',
            background: medal,
            color: hasMedal ? '#111113' : '#d4d4d8',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 1,
          }}
        >
          <span style={{ fontSize: 54, fontStyle: 'italic', fontWeight: 900 }}>{positionLabel(finishPosition)}</span>
          <span style={{ marginTop: 6, fontSize: 11, fontWeight: 800, textTransform: 'uppercase' }}>
            {result.finishingPositionInClass !== null ? 'In class' : 'Overall'}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {result.seriesName && (
            <div
              style={{
                alignSelf: 'flex-start',
                padding: '3px 14px',
                background: '#e10600',
                color: '#ffffff',
                fontSize: 11,
                fontWeight: 800,
                textTransform: 'uppercase',
              }}
            >
              {result.seriesName}
            </div>
          )}
          <div style={{ marginTop: 10, fontSize: 40, fontWeight: 800, lineHeight: 1.05 }}>
            {result.trackName}
            {result.trackConfig ? ` — ${result.trackConfig}` : ''}
          </div>
          <div style={{ marginTop: 10, fontSize: 15, color: '#a1a1a8' }}>{subline}</div>
        </div>
      </div>

      <div style={{ position: 'relative', display: 'flex', gap: 10, marginTop: 30 }}>
        {[
          {
            label: 'Start',
            value: positionLabel(result.startingPositionInClass ?? result.startingPosition),
            accent: false,
          },
          { label: 'Finish', value: positionLabel(finishPosition), accent: true },
          { label: 'Duration', value: guessRaceLength(durationMs), accent: false },
          {
            label: 'Laps',
            value: `${result.teamLapsComplete ?? '—'}${result.totalLaps ? ` / ${result.totalLaps}` : ''}`,
            accent: false,
          },
          {
            label: 'Incidents',
            value: result.teamIncidents !== null ? `${result.teamIncidents}x` : '—',
            accent: false,
          },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              flex: 1,
              minWidth: 0,
              background: '#0b0b0c',
              padding: '14px 16px',
              boxShadow: stat.accent ? 'inset 0 -3px 0 #e10600' : undefined,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: '#a1a1a8' }}>{stat.label}</div>
            <div
              style={{
                marginTop: 2,
                fontSize: 28,
                fontStyle: 'italic',
                fontWeight: 900,
                lineHeight: 1.1,
                whiteSpace: 'nowrap',
              }}
            >
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      <div style={{ position: 'relative', marginTop: 26, fontSize: 13, fontWeight: 600, color: '#a1a1a8' }}>
        Drivers
      </div>
      <div style={{ position: 'relative', marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {result.driverStints.map((stint) => (
          <div
            key={stint.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#0b0b0c',
              padding: '10px 16px',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, fontWeight: 700 }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  flex: 'none',
                  background: driverColors.get(stint.iracingCustId) ?? '#7a8b99',
                }}
              />
              {stint.displayName}
            </span>
            <span style={{ fontSize: 13, color: '#a1a1a8' }}>
              {stint.lapsComplete ?? '—'} laps · best {formatLapTime(stint.bestLapTimeMs)} · {stint.incidents ?? 0}x
            </span>
          </div>
        ))}
      </div>

      <div
        style={{
          position: 'relative',
          marginTop: 22,
          paddingTop: 16,
          borderTop: '1px solid #222226',
          fontSize: 11,
          color: '#6e6e76',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>Subsession #{result.subsessionId}</span>
        <span>Endurance Sportscar Racing</span>
      </div>
    </div>
  );
}
