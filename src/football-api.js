const db = require('./database');

const API_URL = 'https://api.football-data.org/v4';
const API_KEY  = process.env.FOOTBALL_API_KEY;

const COMPETITIONS = {
  'Premier League': 'PL',
  'World Cup': 'WC',
};

async function apiFetch(path) {
  const res = await fetch(`${API_URL}${path}`, { headers: { 'X-Auth-Token': API_KEY } });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

async function syncFixtures(competitionName) {
  const code = COMPETITIONS[competitionName];
  if (!code) return 0;

  const data = await apiFetch(`/competitions/${code}/matches?status=SCHEDULED&limit=30`);

  const insert = db.db.prepare(`
    INSERT INTO matches (competition, home_team, away_team, match_date, api_id, gameweek, kickoff_ts)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(api_id) DO UPDATE SET match_date = excluded.match_date, kickoff_ts = excluded.kickoff_ts
  `);

  let count = 0;
  for (const match of data.matches || []) {
    const kickoffTs = Math.floor(new Date(match.utcDate).getTime() / 1000);
    const date = new Date(match.utcDate).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London'
    });
    const gameweek = match.matchday || null;
    insert.run(competitionName, match.homeTeam.name, match.awayTeam.name, date, String(match.id), gameweek, kickoffTs);
    count++;
  }
  return count;
}

async function syncResults(competitionName) {
  const code = COMPETITIONS[competitionName];
  if (!code) return 0;

  const data = await apiFetch(`/competitions/${code}/matches?status=FINISHED&limit=10`);

  let scored = 0;
  for (const match of data.matches || []) {
    const row = db.db.prepare('SELECT * FROM matches WHERE api_id = ?').get(String(match.id));
    if (!row || row.home_score !== null) continue;
    const home = match.score.fullTime.home;
    const away = match.score.fullTime.away;
    if (home === null || away === null) continue;
    db.setResult(row.id, home, away);
    scored++;
  }
  return scored;
}

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

function getUpcoming(competitionName, limit = 10) {
  if (competitionName) {
    return db.db.prepare(`SELECT * FROM matches WHERE competition = ? AND home_score IS NULL ORDER BY match_date ASC LIMIT ?`).all(competitionName, limit);
  }
  return db.db.prepare(`SELECT * FROM matches WHERE home_score IS NULL ORDER BY match_date ASC LIMIT ?`).all(limit);
}

function getRecentResults(competitionName, limit = 10) {
  if (competitionName) {
    return db.db.prepare(`SELECT * FROM matches WHERE competition = ? AND home_score IS NOT NULL ORDER BY match_date DESC LIMIT ?`).all(competitionName, limit);
  }
  return db.db.prepare(`SELECT * FROM matches WHERE home_score IS NOT NULL ORDER BY match_date DESC LIMIT ?`).all(limit);
}

module.exports = { syncAll, syncFixtures, syncResults, getUpcoming, getRecentResults };
