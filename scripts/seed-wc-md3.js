/**
 * One-time seed script for WC Group Stage MD3 fixtures.
 * Run with: node scripts/seed-wc-md3.js
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && (process.env.DATABASE_URL.includes('railway') || process.env.DATABASE_URL.includes('rlwy.net'))
    ? { rejectUnauthorized: false }
    : false,
});

// BST = UTC+1. Returns unix timestamp.
function bst(dateStr, hour) {
  return Math.floor(new Date(`${dateStr}T${String(hour).padStart(2,'0')}:00:00+01:00`).getTime() / 1000);
}

const FIXTURES = [
  // Wednesday 24 June — games likely already started, no kickoff_ts so users can still predict
  { home: 'Scotland',               away: 'Brazil',          date: '24 Jun 2026, 20:00', ts: null },
  { home: 'Morocco',                away: 'Haiti',           date: '24 Jun 2026, 20:00', ts: null },
  { home: 'Switzerland',            away: 'Canada',          date: '24 Jun 2026, 23:00', ts: null },
  { home: 'Bosnia and Herzegovina', away: 'Qatar',           date: '24 Jun 2026, 23:00', ts: null },
  { home: 'Czechia',                away: 'Mexico',          date: '24 Jun 2026, 17:00', ts: null },
  { home: 'South Africa',           away: 'Korea Republic',  date: '24 Jun 2026, 17:00', ts: null },

  // Thursday 25 June
  { home: 'Curaçao',    away: 'Côte d\'Ivoire', date: '25 Jun 2026, 17:00', ts: bst('2026-06-25', 17) },
  { home: 'Ecuador',    away: 'Germany',         date: '25 Jun 2026, 17:00', ts: bst('2026-06-25', 17) },
  { home: 'Japan',      away: 'Sweden',          date: '25 Jun 2026, 20:00', ts: bst('2026-06-25', 20) },
  { home: 'Tunisia',    away: 'Netherlands',     date: '25 Jun 2026, 20:00', ts: bst('2026-06-25', 20) },
  { home: 'Türkiye',    away: 'USA',             date: '25 Jun 2026, 23:00', ts: bst('2026-06-25', 23) },
  { home: 'Paraguay',   away: 'Australia',       date: '25 Jun 2026, 23:00', ts: bst('2026-06-25', 23) },

  // Friday 26 June
  { home: 'Norway',      away: 'France',          date: '26 Jun 2026, 17:00', ts: bst('2026-06-26', 17) },
  { home: 'Senegal',     away: 'Iraq',            date: '26 Jun 2026, 17:00', ts: bst('2026-06-26', 17) },
  { home: 'Egypt',       away: 'IR Iran',         date: '26 Jun 2026, 20:00', ts: bst('2026-06-26', 20) },
  { home: 'New Zealand', away: 'Belgium',         date: '26 Jun 2026, 20:00', ts: bst('2026-06-26', 20) },
  { home: 'Cabo Verde',  away: 'Saudi Arabia',    date: '26 Jun 2026, 23:00', ts: bst('2026-06-26', 23) },
  { home: 'Uruguay',     away: 'Spain',           date: '26 Jun 2026, 23:00', ts: bst('2026-06-26', 23) },

  // Saturday 27 June
  { home: 'Panama',    away: 'England',    date: '27 Jun 2026, 17:00', ts: bst('2026-06-27', 17) },
  { home: 'Croatia',   away: 'Ghana',      date: '27 Jun 2026, 17:00', ts: bst('2026-06-27', 17) },
  { home: 'Algeria',   away: 'Austria',    date: '27 Jun 2026, 20:00', ts: bst('2026-06-27', 20) },
  { home: 'Jordan',    away: 'Argentina',  date: '27 Jun 2026, 20:00', ts: bst('2026-06-27', 20) },
  { home: 'Colombia',  away: 'Portugal',   date: '27 Jun 2026, 23:00', ts: bst('2026-06-27', 23) },
  { home: 'Congo DR',  away: 'Uzbekistan', date: '27 Jun 2026, 23:00', ts: bst('2026-06-27', 23) },
];

async function seed() {
  let inserted = 0;
  let skipped = 0;
  for (const f of FIXTURES) {
    const existing = await pool.query(
      `SELECT id FROM matches WHERE competition = 'World Cup' AND home_team = $1 AND away_team = $2 AND gameweek = 3`,
      [f.home, f.away]
    );
    if (existing.rows.length > 0) {
      console.log(`⏭  Already exists: ${f.home} v ${f.away}`);
      skipped++;
      continue;
    }
    await pool.query(
      `INSERT INTO matches (competition, home_team, away_team, match_date, gameweek, kickoff_ts)
       VALUES ('World Cup', $1, $2, $3, 3, $4)`,
      [f.home, f.away, f.date, f.ts]
    );
    console.log(`✅ Inserted: ${f.home} v ${f.away}`);
    inserted++;
  }
  console.log(`\nDone — ${inserted} inserted, ${skipped} skipped.`);
  await pool.end();
}

seed().catch(err => { console.error(err); process.exit(1); });
