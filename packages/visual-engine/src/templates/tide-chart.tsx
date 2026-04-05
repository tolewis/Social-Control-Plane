import React from 'react';
import type { TideChartData, TideDay, TideEvent } from './types.js';
import { BRAND, BrandFooter } from './brand.js';

function TideTag({ event }: { event: TideEvent }) {
  const isHigh = event.type === 'high';
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '3px 10px',
        borderRadius: 4,
        backgroundColor: isHigh ? '#1E3A5F' : '#1A2D45',
      }}>
        <span style={{
          fontSize: 16,
          fontWeight: 700,
          color: isHigh ? BRAND.colors.cyan : BRAND.colors.muted,
          letterSpacing: '1px',
        }}>
          {isHigh ? 'H' : 'L'}
        </span>
      </div>
      <span style={{
        fontSize: 22,
        fontWeight: 700,
        color: BRAND.colors.white,
      }}>
        {event.time}
      </span>
      <span style={{
        fontSize: 20,
        color: BRAND.colors.muted,
      }}>
        {event.heightFt.toFixed(1)}ft
      </span>
    </div>
  );
}

function DayRow({ day, isLast }: { day: TideDay; isLast: boolean }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      borderBottom: isLast ? 'none' : `1px solid ${BRAND.colors.rowDivider}`,
      padding: '18px 0',
    }}>
      {/* Day label row */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
      }}>
        <span style={{
          fontSize: 32,
          fontWeight: 700,
          color: BRAND.colors.white,
        }}>
          {day.label}
        </span>
        {day.bestWindow && (
          <div style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}>
            <span style={{
              fontSize: 16,
              fontWeight: 800,
              color: BRAND.colors.headline,
              letterSpacing: '1px',
            }}>
              BEST
            </span>
            <span style={{
              fontSize: 22,
              fontWeight: 700,
              color: BRAND.colors.green,
            }}>
              {day.bestWindow}
            </span>
          </div>
        )}
      </div>

      {/* Tide events */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        gap: 24,
        marginTop: 8,
        flexWrap: 'wrap',
      }}>
        {day.tides.map((event, i) => (
          <TideTag key={i} event={event} />
        ))}
      </div>

      {/* Note */}
      {day.note && (
        <span style={{
          fontSize: 18,
          color: BRAND.colors.species,
          fontStyle: 'italic',
          marginTop: 6,
        }}>
          {day.note}
        </span>
      )}
    </div>
  );
}

export function tideChartTemplate(data: TideChartData) {
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
        marginBottom: 28,
      }}>
        <span style={{
          fontSize: 78,
          fontWeight: 900,
          color: BRAND.colors.headline,
          lineHeight: 1.05,
          letterSpacing: '-2px',
        }}>
          TIDE WINDOWS
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
            {data.location}
          </span>
        </div>
        <span style={{
          fontSize: 22,
          color: BRAND.colors.tagline,
          marginTop: 8,
        }}>
          {data.dateRange}  |  {sourceUrl}
        </span>
      </div>

      {/* ── Day rows ── */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
      }}>
        {data.days.map((day, i) => (
          <DayRow key={i} day={day} isLast={i === data.days.length - 1} />
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
