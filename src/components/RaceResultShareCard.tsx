import { formatLapTime, guessRaceLength } from '../lib/lapTime';
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
 * html-to-image can't capture) and rendered to a canvas on export. */
export default function RaceResultShareCard({ result }: { result: RaceResult }) {
  const durationMs =
    result.startTime && result.endTime
      ? new Date(result.endTime).getTime() - new Date(result.startTime).getTime()
      : null;

  return (
    <div
      style={{
        width: 1000,
        background: '#0a0a0b',
        color: '#ffffff',
        fontFamily: 'Arial, sans-serif',
        padding: 48,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid #232327',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 4, textTransform: 'uppercase' }}>
          W<span style={{ color: '#2e6ff2' }}>2</span>W Racing
        </div>
        {result.seriesName && (
          <div style={{ fontSize: 13, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>
            {result.seriesName}
          </div>
        )}
      </div>

      <div style={{ marginTop: 28 }}>
        <div style={{ fontSize: 34, fontWeight: 900, textTransform: 'uppercase' }}>
          {result.trackName}
          {result.trackConfig ? ` — ${result.trackConfig}` : ''}
        </div>
        <div style={{ marginTop: 6, fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>
          {[
            result.carName,
            result.totalSplits && result.totalSplits > 1 ? `Split ${result.splitNumber}/${result.totalSplits}` : null,
            result.startTime ? new Date(result.startTime).toLocaleDateString() : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 32 }}>
        {[
          {
            label: 'Start',
            value: positionLabel(result.startingPositionInClass ?? result.startingPosition),
            color: '#ffffff',
          },
          {
            label: 'Finish',
            value: positionLabel(result.finishingPositionInClass ?? result.finishingPosition),
            color: sharedCardPositionColor(result.finishingPositionInClass ?? result.finishingPosition, '#4f8cff'),
          },
          { label: 'Duration', value: guessRaceLength(durationMs), color: '#ffffff' },
          {
            label: 'Laps',
            value: `${result.teamLapsComplete ?? '—'}${result.totalLaps ? ` / ${result.totalLaps}` : ''}`,
            color: '#ffffff',
          },
          { label: 'Incidents', value: String(result.teamIncidents ?? '—'), color: '#ffffff' },
        ].map((stat) => (
          <div key={stat.label} style={{ background: '#1a1a1d', border: '1px solid #232327', padding: '14px 20px', flex: 1 }}>
            <div style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>
              {stat.label}
            </div>
            <div style={{ marginTop: 4, fontSize: 24, fontWeight: 900, color: stat.color }}>{stat.value}</div>
          </div>
        ))}
      </div>

      <div
        style={{ marginTop: 20, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}
      >
        Drivers
      </div>
      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {result.driverStints.map((stint) => (
          <div
            key={stint.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#1a1a1d',
              padding: '10px 16px',
            }}
          >
            <span style={{ fontSize: 15, fontWeight: 700 }}>{stint.displayName}</span>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
              {stint.lapsComplete ?? '—'} laps · best {formatLapTime(stint.bestLapTimeMs)} · {stint.incidents ?? 0}x
            </span>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 20,
          paddingTop: 16,
          borderTop: '1px solid #232327',
          fontSize: 11,
          color: 'rgba(255,255,255,0.3)',
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
