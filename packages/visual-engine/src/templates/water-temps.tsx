import type { WaterTempsData, WaterTempRegion } from './types.js';
import { loadAssetDataUri } from '../assets.js';

// ─── Brand constants ────────────────────────────────────────────────────────
// These are locked — agents cannot override them via prompt.

const COLORS = {
  bg: '#0B1929',
  bgGradientEnd: '#0F1F33',
  headline: '#FF6B35',
  regionName: '#FFFFFF',
  tempRange: '#7A8FA8',
  deltaPositive: '#4ADE80',
  deltaNegative: '#F87171',
  species: '#5BAE6B',
  brandName: '#FFFFFF',
  tagline: '#6B7F99',
  divider: '#FF6B35',
  sourceUrl: '#6B7F99',
  rowDivider: '#1A2D45',
} as const;

// ─── Sub-components ─────────────────────────────────────────────────────────

function RegionRow({ region, isLast }: { region: WaterTempRegion; isLast: boolean }) {
  const deltaColor = region.delta >= 0 ? COLORS.deltaPositive : COLORS.deltaNegative;
  const deltaSign = region.delta >= 0 ? '+' : '';

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      borderBottom: isLast ? 'none' : `1px solid ${COLORS.rowDivider}`,
      padding: '22px 0',
    }}>
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'baseline',
        width: '100%',
      }}>
        {/* Region name */}
        <div style={{
          display: 'flex',
          flex: 1,
        }}>
          <span style={{
            fontSize: 38,
            fontWeight: 700,
            color: COLORS.regionName,
            lineHeight: 1.2,
          }}>
            {region.name}
          </span>
        </div>

        {/* Delta — the hero number */}
        <div style={{
          display: 'flex',
          marginLeft: 16,
        }}>
          <span style={{
            fontSize: 52,
            fontWeight: 900,
            color: deltaColor,
            lineHeight: 1,
          }}>
            {deltaSign}{region.delta.toFixed(1)}°F
          </span>
        </div>
      </div>

      {/* Second line: temp range + species */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 6,
        width: '100%',
      }}>
        <span style={{
          fontSize: 22,
          color: COLORS.tempRange,
        }}>
          {region.tempFrom}°F  →  {region.tempTo}°F
        </span>
        {region.species && (
          <span style={{
            fontSize: 22,
            color: COLORS.species,
            fontWeight: 400,
          }}>
            {region.species}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Main template ──────────────────────────────────────────────────────────

export function waterTempsTemplate(data: WaterTempsData) {
  const brandName = data.brandName ?? 'THE TACKLE ROOM';
  const tagline = data.tagline ?? '16 saltwater regions  |  Free weekly forecast';
  const sourceUrl = data.sourceUrl ?? 'tackleroomsupply.com/forecast';

  // Try loading logo — gracefully degrade if not present
  let logoSrc: string | null = null;
  try {
    logoSrc = loadAssetDataUri(data.logoFile ?? 'logo.png');
  } catch {
    // No logo file — skip it
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      height: '100%',
      background: `linear-gradient(180deg, ${COLORS.bg} 0%, ${COLORS.bgGradientEnd} 100%)`,
      padding: '64px 60px',
      fontFamily: 'Inter',
    }}>

      {/* ── Header ── */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        marginBottom: 36,
      }}>
        <span style={{
          fontSize: 84,
          fontWeight: 900,
          color: COLORS.headline,
          lineHeight: 1.05,
          letterSpacing: '-2px',
        }}>
          WATER TEMPS
        </span>
        <span style={{
          fontSize: 84,
          fontWeight: 900,
          color: COLORS.headline,
          lineHeight: 1.05,
          letterSpacing: '-2px',
        }}>
          ARE MOVING
        </span>
        <span style={{
          fontSize: 22,
          color: COLORS.sourceUrl,
          marginTop: 16,
        }}>
          {data.weekOf}  |  {sourceUrl}
        </span>
      </div>

      {/* ── Region rows ── */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
      }}>
        {data.regions.map((region, i) => (
          <RegionRow key={i} region={region} isLast={i === data.regions.length - 1} />
        ))}
      </div>

      {/* ── Divider ── */}
      <div style={{
        display: 'flex',
        width: '100%',
        height: 3,
        background: COLORS.divider,
        marginTop: 16,
        marginBottom: 20,
      }} />

      {/* ── Footer: brand + logo ── */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{
            fontSize: 34,
            fontWeight: 800,
            color: COLORS.brandName,
            letterSpacing: '3px',
          }}>
            {brandName}
          </span>
          <span style={{
            fontSize: 18,
            color: COLORS.tagline,
            marginTop: 6,
          }}>
            {tagline}
          </span>
        </div>
        {logoSrc && (
          <img
            src={logoSrc}
            width={110}
            height={110}
            style={{ borderRadius: 55 }}
          />
        )}
      </div>
    </div>
  );
}
