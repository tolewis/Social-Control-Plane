import React from 'react';
import type { ProductSpotlightData, ProductSpec } from './types.js';
import { BRAND, BrandFooter } from './brand.js';

function SpecRow({ spec, isLast }: { spec: ProductSpec; isLast: boolean }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      width: '100%',
      padding: '14px 0',
      borderBottom: isLast ? 'none' : `1px solid ${BRAND.colors.rowDivider}`,
    }}>
      <span style={{
        fontSize: 22,
        fontWeight: 700,
        color: BRAND.colors.cyan,
        letterSpacing: '1px',
        textTransform: 'uppercase',
      }}>
        {spec.label}
      </span>
      <span style={{
        fontSize: 24,
        fontWeight: 400,
        color: BRAND.colors.white,
      }}>
        {spec.value}
      </span>
    </div>
  );
}

export function productSpotlightTemplate(data: ProductSpotlightData) {
  const inStock = data.inStock ?? true;

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

      {/* ── Category + stock badge ── */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        marginBottom: 16,
      }}>
        <div style={{
          display: 'flex',
          padding: '6px 18px',
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
        <div style={{
          display: 'flex',
          padding: '6px 16px',
          borderRadius: 6,
          backgroundColor: inStock ? '#14532D' : '#7F1D1D',
        }}>
          <span style={{
            fontSize: 18,
            fontWeight: 800,
            color: inStock ? BRAND.colors.green : BRAND.colors.red,
            letterSpacing: '1px',
          }}>
            {inStock ? 'IN STOCK' : 'SOLD OUT'}
          </span>
        </div>
      </div>

      {/* ── Product name ── */}
      <span style={{
        fontSize: 68,
        fontWeight: 900,
        color: BRAND.colors.white,
        lineHeight: 1.1,
        letterSpacing: '-1px',
        marginBottom: 8,
      }}>
        {data.name}
      </span>

      {/* ── Price ── */}
      {data.price && (
        <span style={{
          fontSize: 52,
          fontWeight: 900,
          color: BRAND.colors.headline,
          lineHeight: 1,
          marginBottom: 32,
        }}>
          {data.price}
        </span>
      )}

      {/* ── Specs ── */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        borderRadius: 12,
        backgroundColor: '#0D2137',
        border: `1px solid ${BRAND.colors.rowDivider}`,
        padding: '16px 32px',
      }}>
        {data.specs.map((spec, i) => (
          <SpecRow key={i} spec={spec} isLast={i === data.specs.length - 1} />
        ))}
      </div>

      {/* ── Pitch ── */}
      {data.pitch && (
        <span style={{
          fontSize: 24,
          color: BRAND.colors.muted,
          marginTop: 24,
          lineHeight: 1.4,
        }}>
          {data.pitch}
        </span>
      )}

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
