const db = require('./database');

const API_URL = 'https://api.football-data.org/v4';
const API_KEY  = process.env.FOOTBALL_API_KEY;

// Competition IDs on football-data.org
const COMPETITIONS = {
  'Premier League': 'PL',
  'World Cup':      'WC',
};

// ── Raw fetch helper ───────────────────────────────────────────

async function apiFetch(path) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'X-Auth-Token': API_KEY },
  });
  if (!res.ok) {
    throw new Error(`football-data.org error ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

// ── Sync fixtures for a competition ───────────────────────────

async function syncFixtures(competitionName) {
  const code = COMPETITIONS[competitionName];
  if (!code) return;

  const data = await apiFetch(`/competitions/${code}/matches?status=SCHEDULED&limit=20`);

  const insert = db.db.prepare(`
    INSERT INTO matches (competition, home_team, away_team, match_date, api_id)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(api_id) DO UPDATE SET
      match_date = excluded.match_date
  `);

  let count = 0;
  for (const match of data.matches || []) {
    const date = new Date(match.utcDate).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London'
    });
    insert.run(
      competitionName,
      match.homeTeam.name,
      match.awayTeam.name,
      date,
      String(match.id)
    );
    count++;
  }
  return count;
}

// ── Sync results & auto-score predictions ─────────────────────

async function syncResults(competitionName) {
  const code = COMPETITIONS[competitionName];
  if (!code) return;

  const data = await apiFetch(`/competitions/${code}/matches?status=FINISHED&limit=10`);

  let scored = 0;
  for (const match of data.matches || []) {
    const row = db.db.prepare('SELECT * FROM matches WHERE api_id = ?').get(String(match.id));
    if (!row) continue;
    if (row.home_score !== null) continue; // already set

    const home = match.score.fullTime.home;
    const away = match.score.fullTime.away;
    if (home === null || away === null) continue;

    db.setResult(row.id, home, away);
    scored++;
  }
  return scored;
}

// ── Sync both competitions ─────────────────────────────────────

async function syncAll() {
  const results = {};
  for (const comp of Object.keys(COMPETITIONS)) {
    try {
      const fixtures = await syncFixtures(comp);
      const scored   = await syncResults(comp);
      results[comp] = { fixtures, scored };
    } catch (err) {
      results[comp] = { error: err.message };
    }
  }
  return results;
}

// ── Get upcoming fixtures from DB ─────────────────────────────

function getUpcoming(competitionName, limit = 10) {
  if (competitionName) {
    return db.db.prepare(`
      SELECT * FROM matches
      WHERE competition = ? AND home_score IS NULL
      ORDER BY match_date ASC LIMIT ?
    `).all(competitionName, limit);
  }
  return db.db.prepare(`
    SELECT * FROM matches
    WHERE home_score IS NULL
    ORDER BY match_date ASC LIMIT ?
  `).all(limit);
}

// ── Get recent results from DB ────────────────────────────────

function getRecentResults(competitionName, limit = 10) {
  if (competitionName) {
    return db.db.prepare(`
      SELECT * FROM matches
      WHERE competition = ? AND home_score IS NOT NULL
      ORDER BY match_date DESC LIMIT ?
    `).all(competitionName, limit);
  }
  return db.db.prepare(`
    SELECT * FROM matches
    WHERE home_score IS NOT NULL
    ORDER BY match_date DESC LIMIT ?
  `).all(limit);
}

module.exports = { syncAll, syncFixtures, syncResults, getUpcoming, getRecentResults };
