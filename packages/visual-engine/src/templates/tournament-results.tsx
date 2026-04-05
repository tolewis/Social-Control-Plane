import React from 'react';
import type { TournamentResultsData, TournamentEntry } from './types.js';
import { BRAND, BrandFooter } from './brand.js';

const RANK_COLORS: Record<number, string> = {
  1: '#FFD700', // gold
  2: '#C0C0C0', // silver
  3: '#CD7F32', // bronze
};

function LeaderboardRow({ entry, isLast }: { entry: TournamentEntry; isLast: boolean }) {
  const rankColor = RANK_COLORS[entry.rank] ?? BRAND.colors.muted;
  const isTop3 = entry.rank <= 3;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      width: '100%',
      padding: isTop3 ? '20px 0' : '14px 0',
      borderBottom: isLast ? 'none' : `1px solid ${BRAND.colors.rowDivider}`,
    }}>
      {/* Rank */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 56,
        marginRight: 20,
      }}>
        <span style={{
          fontSize: isTop3 ? 42 : 28,
          fontWeight: 900,
          color: rankColor,
          lineHeight: 1,
        }}>
          {entry.rank}
        </span>
      </div>

      {/* Name + species */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
      }}>
        <span style={{
          fontSize: isTop3 ? 34 : 26,
          fontWeight: 700,
          color: BRAND.colors.white,
          lineHeight: 1.2,
        }}>
          {entry.name}
        </span>
        {entry.species && (
          <span style={{
            fontSize: 20,
            color: BRAND.colors.muted,
            marginTop: 2,
          }}>
            {entry.species}
          </span>
        )}
      </div>

      {/* Weight */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
      }}>
        <span style={{
          fontSize: isTop3 ? 40 : 28,
          fontWeight: 900,
          color: isTop3 ? BRAND.colors.green : BRAND.colors.white,
          lineHeight: 1,
        }}>
          {entry.weight}
        </span>
        {entry.note && (
          <span style={{
            fontSize: 16,
            color: BRAND.colors.headline,
            fontWeight: 700,
            marginTop: 4,
          }}>
            {entry.note}
          </span>
        )}
      </div>
    </div>
  );
}

export function tournamentResultsTemplate(data: TournamentResultsData) {
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
          fontSize: 72,
          fontWeight: 900,
          color: BRAND.colors.headline,
          lineHeight: 1.05,
          letterSpacing: '-2px',
        }}>
          {data.tournamentName.toUpperCase()}
        </span>
        <div style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'baseline',
          gap: 16,
          marginTop: 12,
        }}>
          <span style={{
            fontSize: 24,
            color: BRAND.colors.white,
            fontWeight: 700,
          }}>
            {data.date}
          </span>
          {data.location && (
            <span style={{
              fontSize: 24,
              color: BRAND.colors.muted,
            }}>
              {data.location}
            </span>
          )}
          {data.totalParticipants && (
            <span style={{
              fontSize: 22,
              color: BRAND.colors.tagline,
            }}>
              {data.totalParticipants}
            </span>
          )}
        </div>
      </div>

      {/* ── Leaderboard ── */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
      }}>
        {data.leaderboard.map((entry, i) => (
          <LeaderboardRow key={i} entry={entry} isLast={i === data.leaderboard.length - 1} />
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
