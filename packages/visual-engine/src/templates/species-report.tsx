import type { SpeciesReportData, SpeciesEntry } from './types.js';
import { BRAND, BrandFooter } from './brand.js';

const STATUS_CONFIG = {
  hot:    { label: 'HOT',    color: '#EF4444', bg: '#7F1D1D' },
  active: { label: 'ACTIVE', color: '#4ADE80', bg: '#14532D' },
  slow:   { label: 'SLOW',   color: '#FBBF24', bg: '#78350F' },
  off:    { label: 'OFF',    color: '#6B7280', bg: '#1F2937' },
} as const;

function StatusBadge({ status }: { status: SpeciesEntry['status'] }) {
  const config = STATUS_CONFIG[status];
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '6px 16px',
      borderRadius: 6,
      backgroundColor: config.bg,
    }}>
      <span style={{
        fontSize: 18,
        fontWeight: 800,
        color: config.color,
        letterSpacing: '1px',
      }}>
        {config.label}
      </span>
    </div>
  );
}

function SpeciesRow({ entry, isLast }: { entry: SpeciesEntry; isLast: boolean }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      borderBottom: isLast ? 'none' : `1px solid ${BRAND.colors.rowDivider}`,
      padding: '20px 0',
    }}>
      {/* Top line: species name + status badge */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
      }}>
        <span style={{
          fontSize: 38,
          fontWeight: 700,
          color: BRAND.colors.white,
          lineHeight: 1.2,
        }}>
          {entry.name}
        </span>
        <StatusBadge status={entry.status} />
      </div>

      {/* Detail lines */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        marginTop: 8,
        gap: 4,
      }}>
        {entry.where && (
          <div style={{ display: 'flex', flexDirection: 'row' }}>
            <span style={{ fontSize: 20, color: BRAND.colors.cyan, fontWeight: 700, minWidth: 80 }}>
              WHERE
            </span>
            <span style={{ fontSize: 20, color: BRAND.colors.muted, marginLeft: 12 }}>
              {entry.where}
            </span>
          </div>
        )}
        {entry.bait && (
          <div style={{ display: 'flex', flexDirection: 'row' }}>
            <span style={{ fontSize: 20, color: BRAND.colors.cyan, fontWeight: 700, minWidth: 80 }}>
              BAIT
            </span>
            <span style={{ fontSize: 20, color: BRAND.colors.muted, marginLeft: 12 }}>
              {entry.bait}
            </span>
          </div>
        )}
        {entry.note && (
          <div style={{ display: 'flex', flexDirection: 'row', marginTop: 4 }}>
            <span style={{ fontSize: 18, color: BRAND.colors.species, fontStyle: 'italic' }}>
              {entry.note}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function speciesReportTemplate(data: SpeciesReportData) {
  const sourceUrl = data.sourceUrl ?? BRAND.defaults.sourceUrl;

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
          WHAT&#39;S BITING
        </span>
        <div style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'baseline',
          marginTop: 12,
          gap: 16,
        }}>
          <span style={{
            fontSize: 32,
            fontWeight: 700,
            color: BRAND.colors.white,
          }}>
            {data.region}
          </span>
          {data.waterTemp && (
            <span style={{
              fontSize: 28,
              fontWeight: 700,
              color: BRAND.colors.cyan,
            }}>
              {data.waterTemp}
            </span>
          )}
        </div>
        <span style={{
          fontSize: 22,
          color: BRAND.colors.tagline,
          marginTop: 8,
        }}>
          {data.weekOf}  |  {sourceUrl}
        </span>
      </div>

      {/* ── Species rows ── */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
      }}>
        {data.species.map((entry, i) => (
          <SpeciesRow key={i} entry={entry} isLast={i === data.species.length - 1} />
        ))}
      </div>

      {/* ── Footer ── */}
      <BrandFooter
        brandName={data.brandName}
        tagline={data.tagline}
        logoFile={data.logoFile}
      />
    </div>
  );
}
