import type { ArticleAdData } from './types.js';
import { BRAND, BrandFooter } from './brand.js';

export function articleAdTemplate(data: ArticleAdData) {
  const cta = data.cta ?? 'Read the full guide →';

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

      {/* ── Category + read time ── */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        marginBottom: 24,
      }}>
        <div style={{
          display: 'flex',
          padding: '8px 20px',
          borderRadius: 6,
          backgroundColor: '#1E3A5F',
        }}>
          <span style={{
            fontSize: 20,
            fontWeight: 800,
            color: BRAND.colors.cyan,
            letterSpacing: '2px',
          }}>
            {data.category.toUpperCase()}
          </span>
        </div>
        {data.readTime && (
          <span style={{
            fontSize: 20,
            color: BRAND.colors.muted,
          }}>
            {data.readTime}
          </span>
        )}
      </div>

      {/* ── Title ── */}
      <span style={{
        fontSize: 68,
        fontWeight: 900,
        color: BRAND.colors.white,
        lineHeight: 1.1,
        letterSpacing: '-1px',
        marginBottom: 20,
      }}>
        {data.title}
      </span>

      {/* ── Hook ── */}
      <span style={{
        fontSize: 26,
        color: BRAND.colors.muted,
        lineHeight: 1.4,
        marginBottom: 32,
      }}>
        {data.hook}
      </span>

      {/* ── Takeaways ── */}
      {data.takeaways && data.takeaways.length > 0 && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          borderRadius: 12,
          backgroundColor: '#0D2137',
          border: `1px solid ${BRAND.colors.rowDivider}`,
          padding: '24px 32px',
          gap: 16,
        }}>
          <span style={{
            fontSize: 16,
            fontWeight: 800,
            color: BRAND.colors.headline,
            letterSpacing: '2px',
            marginBottom: 4,
          }}>
            WHAT YOU&#39;LL LEARN
          </span>
          {data.takeaways.map((t, i) => (
            <div key={i} style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 14,
            }}>
              <span style={{
                fontSize: 22,
                color: BRAND.colors.green,
                fontWeight: 700,
                lineHeight: 1.4,
              }}>
                ✓
              </span>
              <span style={{
                fontSize: 22,
                color: BRAND.colors.white,
                lineHeight: 1.4,
              }}>
                {t.text}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── CTA ── */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        marginTop: 32,
        gap: 12,
      }}>
        <div style={{
          display: 'flex',
          padding: '16px 48px',
          borderRadius: 10,
          backgroundColor: BRAND.colors.headline,
        }}>
          <span style={{
            fontSize: 28,
            fontWeight: 800,
            color: BRAND.colors.white,
          }}>
            {cta}
          </span>
        </div>
        {data.url && (
          <span style={{
            fontSize: 20,
            color: BRAND.colors.tagline,
          }}>
            {data.url}
          </span>
        )}
      </div>

      {/* ── Footer ── */}
      <div style={{ display: 'flex', marginTop: 28 }}>
        <BrandFooter
          brandName={data.brandName}
          tagline={data.tagline}
          logoFile={data.logoFile}
        />
      </div>
    </div>
  );
}
