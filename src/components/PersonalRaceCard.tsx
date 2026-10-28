import { formatShortDate } from '../lib/formatShortDate';
import { initials } from '../lib/initials';
import { formatLapTime } from '../lib/lapTime';
import { computeRaceStrip, type RaceSummary } from '../lib/raceSummary';
import { buildSummaryTiles, type SummaryTileKey } from '../lib/raceSummaryTiles';
import type { RaceResult } from '../types/raceResult';

const CARD_TILES: SummaryTileKey[] = ['laps', 'drive', 'pace', 'best', 'consistency', 'incidents'];
const MAX_STINT_ROWS = 7;

/** Portrait (1080x1350) "my race" image, exported as a PNG by PersonalRaceSummary's "Share image"
 * button via html-to-image. Always dark, whatever the viewer's theme: a fixed branded image. Same
 * approach as RaceResultShareCard: inline resolvable styles only (no CSS variables or Tailwind
 * classes, which the SVG foreignObject render can lose), no clip-path, square corners. Rendered
 * off-screen and aria-hidden by its parent. */
export default function PersonalRaceCard({ result, summary }: { result: RaceResult; summary: RaceSummary }) {
  const tiles = buildSummaryTiles(summary).filter((t) => CARD_TILES.includes(t.key));
  const strip = computeRaceStrip(result, summary.iracingCustId);
  const position = result.finishingPositionInClass ?? result.finishingPosition;
  const teamLine = [
    position !== null ? `Team finished P${position}${result.finishingPositionInClass !== null ? ' in class' : ''}` : null,
    result.carName,
  ]
    .filter(Boolean)
    .join(' · ');
  const subline = [result.startTime ? formatShortDate(result.startTime, true) : null, teamLine || null]
    .filter(Boolean)
    .join(' · ');
  const shownStints = summary.stints.slice(0, MAX_STINT_ROWS);
  const hiddenStints = summary.stints.length - shownStints.length;

  return (
    <div
      style={{
        position: 'relative',
        width: 1080,
        height: 1350,
        background: '#151517',
        color: '#f5f5f5',
        fontFamily: "'Inter', Arial, sans-serif",
        padding: '56px 176px 48px 56px',
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
          width: 130,
          background:
            'linear-gradient(110deg, transparent 0 28%, #e10600 28% 40%, transparent 40% 50%, #e10600 50% 100%)',
        }}
      />

      <div
        style={{
          position: 'relative',
          fontFamily: "'Orbitron', 'Inter', sans-serif",
          fontSize: 24,
          fontWeight: 900,
          letterSpacing: 3,
          textTransform: 'uppercase',
        }}
      >
        W<span style={{ color: '#e10600' }}>2</span>W Racing
      </div>

      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 24, marginTop: 36 }}>
        <div
          style={{
            width: 92,
            height: 92,
            flex: 'none',
            background: '#e10600',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 38,
            fontStyle: 'italic',
            fontWeight: 900,
          }}
        >
          {initials(summary.displayName)}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: 6 }}>
          <div style={{ fontSize: 15, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.5, color: '#a1a1a8' }}>
            My race
          </div>
          <div style={{ fontSize: 52, fontWeight: 800, lineHeight: 1.05, whiteSpace: 'nowrap', overflow: 'hidden' }}>
            {summary.displayName}
          </div>
        </div>
      </div>

      <div style={{ position: 'relative', marginTop: 30, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {result.seriesName && (
          <div
            style={{
              alignSelf: 'flex-start',
              padding: '3px 14px',
              background: '#e10600',
              color: '#ffffff',
              fontSize: 12,
              fontWeight: 800,
              textTransform: 'uppercase',
            }}
          >
            {result.seriesName}
          </div>
        )}
        <div style={{ fontSize: 38, fontWeight: 800, lineHeight: 1.08 }}>
          {result.trackName}
          {result.trackConfig ? ` — ${result.trackConfig}` : ''}
        </div>
        <div style={{ fontSize: 17, color: '#a1a1a8' }}>{subline}</div>
      </div>

      <div style={{ position: 'relative', marginTop: 32, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {tiles.map((tile) => (
          <div
            key={tile.key}
            style={{
              width: 'calc((100% - 24px) / 3)',
              boxSizing: 'border-box',
              background: '#0b0b0c',
              padding: '16px 18px 14px',
              boxShadow: tile.key === 'pace' || tile.key === 'best' ? 'inset 0 -3px 0 #e10600' : undefined,
              minHeight: 138,
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 600, color: '#a1a1a8' }}>{tile.label}</div>
            <div
              style={{
                marginTop: 4,
                fontSize: 44,
                fontStyle: 'italic',
                fontWeight: 900,
                lineHeight: 1.1,
                whiteSpace: 'nowrap',
              }}
            >
              {tile.value}
            </div>
            <div style={{ marginTop: 4, minHeight: 34, fontSize: 13, lineHeight: 1.3, color: '#a1a1a8' }}>{tile.sub}</div>
          </div>
        ))}
      </div>

      {strip.length > 0 && (
        <div style={{ position: 'relative', marginTop: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 600, color: '#a1a1a8' }}>
            <span>
              {summary.stintCount} stint{summary.stintCount === 1 ? '' : 's'} of {strip.length} in the race
            </span>
            <span>Your stints in red</span>
          </div>
          <div style={{ marginTop: 10, display: 'flex', height: 26, background: '#0b0b0c' }}>
            {strip.map((seg) => (
              <div
                key={seg.stintNumber}
                style={{
                  width: `${seg.widthPct}%`,
                  background: seg.mine ? '#e10600' : '#2e2e33',
                  borderRight: '2px solid #151517',
                  boxSizing: 'border-box',
                }}
              />
            ))}
          </div>
        </div>
      )}

      {shownStints.length > 0 && (
        <div style={{ position: 'relative', marginTop: 22, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {shownStints.map((stint) => (
            <div
              key={stint.stintNumber}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: '#0b0b0c',
                padding: '9px 16px',
                boxShadow: 'inset 4px 0 0 #e10600',
                fontSize: 15,
              }}
            >
              <span style={{ fontWeight: 700 }}>
                Stint {stint.stintNumber}
                <span style={{ marginLeft: 10, fontWeight: 400, color: '#a1a1a8' }}>
                  L{stint.startLap}–{stint.endLap}
                </span>
              </span>
              <span style={{ color: '#a1a1a8' }}>
                {stint.laps} lap{stint.laps === 1 ? '' : 's'} · avg {formatLapTime(stint.avgLapMs)} · best{' '}
                {formatLapTime(stint.bestLapMs)}
              </span>
            </div>
          ))}
          {hiddenStints > 0 && (
            <div style={{ fontSize: 13, color: '#a1a1a8' }}>+{hiddenStints} more stint{hiddenStints === 1 ? '' : 's'}</div>
          )}
        </div>
      )}

      <div
        style={{
          position: 'relative',
          marginTop: 'auto',
          paddingTop: 16,
          borderTop: '1px solid #222226',
          fontSize: 12,
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
