import type { CatchOfTheWeekData } from './types.js';
import { BRAND, BrandFooter } from './brand.js';

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      flex: 1,
      padding: '20px 0',
    }}>
      <span style={{
        fontSize: 16,
        fontWeight: 800,
        color: BRAND.colors.headline,
        letterSpacing: '2px',
        marginBottom: 8,
      }}>
        {label}
      </span>
      <span style={{
        fontSize: 36,
        fontWeight: 900,
        color: BRAND.colors.white,
        lineHeight: 1,
      }}>
        {value}
      </span>
    </div>
  );
}

export function catchOfTheWeekTemplate(data: CatchOfTheWeekData) {
  // Collect stats that exist
  const stats: { label: string; value: string }[] = [];
  if (data.weight) stats.push({ label: 'WEIGHT', value: data.weight });
  if (data.length) stats.push({ label: 'LENGTH', value: data.length });

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      height: '100%',
      background: `linear-gradient(180deg, ${BRAND.colors.bg} 0%, ${BRAND.colors.bgGradientEnd} 100%)`,
      padding: '64px 60px',
      fontFamily: BRAND.fonts.family,
    }}>

      {/* ── Header ── */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        marginBottom: 32,
      }}>
        <span style={{
          fontSize: 78,
          fontWeight: 900,
          color: BRAND.colors.headline,
          lineHeight: 1.05,
          letterSpacing: '-2px',
        }}>
          CATCH OF
        </span>
        <span style={{
          fontSize: 78,
          fontWeight: 900,
          color: BRAND.colors.headline,
          lineHeight: 1.05,
          letterSpacing: '-2px',
        }}>
          THE WEEK
        </span>
      </div>

      {/* ── Species hero ── */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
        borderRadius: 16,
        backgroundColor: '#0D2137',
        border: `2px solid ${BRAND.colors.rowDivider}`,
        padding: '40px 48px',
      }}>
        <span style={{
          fontSize: 72,
          fontWeight: 900,
          color: BRAND.colors.white,
          lineHeight: 1.1,
          textAlign: 'center',
        }}>
          {data.species}
        </span>

        {/* Stats row */}
        {stats.length > 0 && (
          <div style={{
            display: 'flex',
            flexDirection: 'row',
            width: '100%',
            marginTop: 32,
            justifyContent: 'center',
            gap: 40,
          }}>
            {stats.map((s, i) => (
              <StatBlock key={i} label={s.label} value={s.value} />
            ))}
          </div>
        )}

        {/* Bait */}
        {data.bait && (
          <div style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            marginTop: 24,
            gap: 10,
          }}>
            <span style={{
              fontSize: 18,
              fontWeight: 800,
              color: BRAND.colors.cyan,
              letterSpacing: '1px',
            }}>
              BAIT
            </span>
            <span style={{
              fontSize: 24,
              color: BRAND.colors.muted,
            }}>
              {data.bait}
            </span>
          </div>
        )}
      </div>

      {/* ── Details bar ── */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        marginTop: 28,
        gap: 8,
      }}>
        <div style={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}>
          <span style={{
            fontSize: 32,
            fontWeight: 700,
            color: BRAND.colors.white,
          }}>
            {data.angler}
          </span>
          <span style={{
            fontSize: 22,
            color: BRAND.colors.muted,
          }}>
            {data.location}
          </span>
        </div>
        <span style={{
          fontSize: 20,
          color: BRAND.colors.tagline,
        }}>
          {data.date}
        </span>
        {data.quote && (
          <span style={{
            fontSize: 22,
            color: BRAND.colors.species,
            fontStyle: 'italic',
            marginTop: 8,
          }}>
            &ldquo;{data.quote}&rdquo;
          </span>
        )}
      </div>

      {/* ── Footer ── */}
      <div style={{ display: 'flex', marginTop: 24 }}>
        <BrandFooter
          brandName={data.brandName}
          tagline={data.tagline}
          logoFile={data.logoFile}
        />
      </div>
    </div>
  );
}
