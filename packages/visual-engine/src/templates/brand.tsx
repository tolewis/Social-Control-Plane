import { loadAssetDataUri } from '../assets.js';

// ─── Shared brand constants ─────────────────────────────────────────────────
// Locked — agents cannot override via prompt.

export const BRAND = {
  colors: {
    bg: '#0B1929',
    bgGradientEnd: '#0F1F33',
    headline: '#FF6B35',
    white: '#FFFFFF',
    muted: '#7A8FA8',
    green: '#4ADE80',
    red: '#F87171',
    species: '#5BAE6B',
    tagline: '#6B7F99',
    divider: '#FF6B35',
    rowDivider: '#1A2D45',
    cyan: '#40E0D0',
    amber: '#FBBF24',
  },
  fonts: {
    family: 'Inter',
  },
  defaults: {
    brandName: 'THE TACKLE ROOM',
    tagline: '16 saltwater regions  |  Free weekly forecast',
    sourceUrl: 'tackleroomsupply.com/forecast',
    logoFile: 'logo.svg',
  },
} as const;

/** Shared footer component for all templates. */
export function BrandFooter({
  brandName,
  tagline,
  logoFile,
}: {
  brandName?: string;
  tagline?: string;
  logoFile?: string;
}) {
  const name = brandName ?? BRAND.defaults.brandName;
  const tag = tagline ?? BRAND.defaults.tagline;

  let logoSrc: string | null = null;
  try {
    logoSrc = loadAssetDataUri(logoFile ?? BRAND.defaults.logoFile);
  } catch {
    // No logo — skip
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
    }}>
      {/* Divider */}
      <div style={{
        display: 'flex',
        width: '100%',
        height: 3,
        background: BRAND.colors.divider,
        marginBottom: 20,
      }} />

      {/* Brand bar */}
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
            color: BRAND.colors.white,
            letterSpacing: '3px',
          }}>
            {name}
          </span>
          <span style={{
            fontSize: 18,
            color: BRAND.colors.tagline,
            marginTop: 6,
          }}>
            {tag}
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
