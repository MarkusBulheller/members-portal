import { barPercent, teamLabel, type RecapBar, type RecapCardModel } from '../../lib/recapCards';
import { monthShort } from '../../lib/recapFormat';
import type { RecapStats } from '../../types/recap';

const ACCENT = '#e10600';
const BG = '#151517';
const PANEL = '#0b0b0c';
const TRACK = '#2e2e33';
const INK = '#f5f5f5';
const MUTED = '#a1a1a8';
const DIM = '#6e6e76';
const MAX_BARS = 6;

function Bars({ heading, bars }: { heading: string; bars: RecapBar[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 17, fontWeight: 600, color: MUTED }}>{heading}</div>
      {bars.map((bar, i) => (
        <div key={`${bar.label}-${i}`} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'baseline' }}>
            <span
              style={{ fontSize: 22, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}
            >
              {bar.label}
            </span>
            <span style={{ fontSize: 20, fontStyle: 'italic', fontWeight: 900, color: MUTED, whiteSpace: 'nowrap' }}>
              {bar.display}
            </span>
          </div>
          <div style={{ height: 10, background: TRACK }}>
            <div style={{ height: 10, width: `${barPercent(bar.value, bars)}%`, background: ACCENT }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Months({ months }: { months: RecapStats['byMonth'] }) {
  const max = Math.max(1, ...months.map((m) => m.races));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 120 }}>
        {months.map((m) => (
          <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
            <div
              style={{
                position: 'relative',
                width: '100%',
                height: m.races === 0 ? 4 : Math.max(10, (m.races / max) * 120),
                background: TRACK,
              }}
            >
              {m.podiums > 0 && (
                <div
                  style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${(m.podiums / m.races) * 100}%`, background: ACCENT }}
                />
              )}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {months.map((m) => (
          <span key={m.month} style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: 600, color: DIM }}>
            {monthShort(m.month).slice(0, 1)}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Square (1080x1080) recap image for one story card, exported as a PNG by RecapPage's "Share" button
 * via html-to-image. Always dark, whatever the viewer's theme. Same approach as PersonalRaceCard:
 * inline resolvable styles only (no CSS variables or Tailwind classes, which the SVG foreignObject
 * render can lose), no clip-path, square corners. Rendered off-screen and aria-hidden by its parent. */
export default function RecapShareCard({ stats, card }: { stats: RecapStats; card: RecapCardModel }) {
  const shownGroups = card.groups.map((g) => ({ ...g, bars: g.bars.slice(0, card.groups.length > 1 ? 4 : MAX_BARS) }));
  const hiddenDrivers = card.key === 'crew' ? stats.drivers.length - shownGroups[0].bars.length : 0;
  const compactHero = card.big.length > 6;

  return (
    <div
      style={{
        position: 'relative',
        width: 1080,
        height: 1080,
        background: BG,
        color: INK,
        fontFamily: "'Inter', Arial, sans-serif",
        padding: '60px 190px 52px 64px',
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
          width: 140,
          background: `linear-gradient(110deg, transparent 0 28%, ${ACCENT} 28% 40%, transparent 40% 50%, ${ACCENT} 50% 100%)`,
        }}
      />

      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 16, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 2, color: MUTED }}>
          Team recap {stats.year}
        </div>
        <div style={{ fontSize: 44, fontWeight: 800, lineHeight: 1.05 }}>{card.title}</div>
      </div>

      <div style={{ position: 'relative', marginTop: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div
          style={{
            fontSize: compactHero ? 120 : 190,
            fontStyle: 'italic',
            fontWeight: 900,
            lineHeight: 1,
            color: ACCENT,
            whiteSpace: 'nowrap',
          }}
        >
          {card.big}
        </div>
        <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.2 }}>{card.bigLabel}</div>
        {card.line && <div style={{ fontSize: 19, lineHeight: 1.35, color: MUTED }}>{card.line}</div>}
      </div>

      <div style={{ position: 'relative', marginTop: 28, display: 'flex', flexDirection: 'column', gap: 22 }}>
        {card.stats.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {card.stats.map((s) => (
              <div
                key={s.label}
                style={{ width: 'calc((100% - 12px) / 2)', boxSizing: 'border-box', background: PANEL, padding: '14px 18px 12px' }}
              >
                <div style={{ fontSize: 16, fontWeight: 600, color: MUTED }}>{s.label}</div>
                <div style={{ marginTop: 2, fontSize: 38, fontStyle: 'italic', fontWeight: 900, lineHeight: 1.15, whiteSpace: 'nowrap' }}>
                  {s.value}
                </div>
              </div>
            ))}
          </div>
        )}

        {shownGroups.map((group) => (
          <Bars key={group.heading} heading={group.heading} bars={group.bars} />
        ))}
        {hiddenDrivers > 0 && <div style={{ fontSize: 15, color: MUTED }}>+{hiddenDrivers} more</div>}

        {card.months && <Months months={card.months} />}

        {card.awards.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {card.awards.slice(0, 6).map((award) => (
              <div
                key={award.key}
                style={{
                  width: 'calc((100% - 12px) / 2)',
                  boxSizing: 'border-box',
                  background: PANEL,
                  padding: '12px 16px 12px',
                  boxShadow: `inset 0 -3px 0 ${ACCENT}`,
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: MUTED }}>
                  {award.title}
                </div>
                <div style={{ marginTop: 2, fontSize: 22, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {award.driverName}
                </div>
                <div style={{ fontSize: 24, fontStyle: 'italic', fontWeight: 900, color: ACCENT, whiteSpace: 'nowrap' }}>{award.value}</div>
              </div>
            ))}
          </div>
        )}

        {card.dates.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {card.dates.map((d) => (
              <div
                key={d.label}
                style={{ width: 'calc((100% - 12px) / 2)', boxSizing: 'border-box', background: PANEL, padding: '14px 18px 12px' }}
              >
                <div style={{ fontSize: 16, fontWeight: 600, color: MUTED }}>{d.label}</div>
                <div style={{ fontSize: 32, fontStyle: 'italic', fontWeight: 900, lineHeight: 1.15, whiteSpace: 'nowrap' }}>{d.value}</div>
                {d.sub && (
                  <div style={{ fontSize: 15, color: MUTED, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.sub}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div
        style={{
          position: 'relative',
          marginTop: 'auto',
          paddingTop: 16,
          borderTop: '1px solid #222226',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 15,
          color: DIM,
        }}
      >
        <span
          style={{
            fontFamily: "'Orbitron', 'Inter', sans-serif",
            fontSize: 22,
            fontWeight: 900,
            letterSpacing: 3,
            textTransform: 'uppercase',
            color: INK,
          }}
        >
          W<span style={{ color: ACCENT }}>2</span>W Racing
        </span>
        <span>
          {teamLabel(stats)} · {stats.year}
        </span>
      </div>
    </div>
  );
}
