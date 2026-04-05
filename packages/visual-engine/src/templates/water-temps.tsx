import type { WaterTempsData, WaterTempRegion } from './types.js';
import { BRAND, BrandFooter } from './brand.js';

// ─── Sub-components ─────────────────────────────────────────────────────────

function RegionRow({ region, isLast }: { region: WaterTempRegion; isLast: boolean }) {
  const deltaColor = region.delta >= 0 ? BRAND.colors.green : BRAND.colors.red;
  const deltaSign = region.delta >= 0 ? '+' : '';

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      borderBottom: isLast ? 'none' : `1px solid ${BRAND.colors.rowDivider}`,
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
            color: BRAND.colors.white,
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
          color: BRAND.colors.muted,
        }}>
          {region.tempFrom}°F  →  {region.tempTo}°F
        </span>
        {region.species && (
          <span style={{
            fontSize: 22,
            color: BRAND.colors.species,
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
        marginBottom: 36,
      }}>
        <span style={{
          fontSize: 84,
          fontWeight: 900,
          color: BRAND.colors.headline,
          lineHeight: 1.05,
          letterSpacing: '-2px',
        }}>
          WATER TEMPS
        </span>
        <span style={{
          fontSize: 84,
          fontWeight: 900,
          color: BRAND.colors.headline,
          lineHeight: 1.05,
          letterSpacing: '-2px',
        }}>
          ARE MOVING
        </span>
        <span style={{
          fontSize: 22,
          color: BRAND.colors.tagline,
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

      {/* ── Footer ── */}
      <div style={{ display: 'flex', marginTop: 16 }}>
        <BrandFooter
          brandName={data.brandName}
          tagline={data.tagline}
          logoFile={data.logoFile}
        />
      </div>
    </div>
  );
}
