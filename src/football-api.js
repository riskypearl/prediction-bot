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

  // Fetch all matches from today onwards regardless of status.
  // This captures SCHEDULED, TIMED, IN_PLAY, and PAUSED games without
  // relying on comma-separated status values which some API tiers don't support.
  const today = new Date().toISOString().slice(0, 10);
  const data = await apiFetch(`/competitions/${code}/matches?dateFrom=${today}`);

  let count = 0;
  for (const match of data.matches || []) {
    // Explicitly check for null/undefined/empty — WC returns { name: null } for placeholder fixtures
    const homeName = match.homeTeam && match.homeTeam.name != null && match.homeTeam.name !== '' ? match.homeTeam.name : null;
    const awayName = match.awayTeam && match.awayTeam.name != null && match.awayTeam.name !== '' ? match.awayTeam.name : null;
    if (!homeName || !awayName) continue;

    const kickoffTs = Math.floor(new Date(match.utcDate).getTime() / 1000);
    const date = new Date(match.utcDate).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London'
    });
    const gameweek = match.matchday || null;
    await db.query(
      `INSERT INTO matches (competition, home_team, away_team, match_date, api_id, gameweek, kickoff_ts)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT(api_id) DO UPDATE SET match_date = EXCLUDED.match_date, kickoff_ts = EXCLUDED.kickoff_ts`,
      [competitionName, homeName, awayName, date, String(match.id), gameweek, kickoffTs]
    );
    count++;
  }
  return count;
}

async function syncResults(competitionName) {
  const code = COMPETITIONS[competitionName];
  if (!code) return { count: 0, matches: [] };

  const data = await apiFetch(`/competitions/${code}/matches?status=FINISHED&limit=10`);

  let count = 0;
  const scoredMatches = [];

  for (const match of data.matches || []) {
    const row = await db.queryOne('SELECT * FROM matches WHERE api_id = $1', [String(match.id)]);
    if (!row || row.home_score !== null) continue;
    const home = match.score.fullTime.home;
    const away = match.score.fullTime.away;
    if (home === null || away === null) continue;
    const predictionsCount = await db.setResult(row.id, home, away);
    scoredMatches.push({ match: row, homeScore: home, awayScore: away, predictionsCount });
    count++;
  }
  return { count, matches: scoredMatches };
}

async function syncAll() {
  const results = {};
  for (const comp of Object.keys(COMPETITIONS)) {
    try {
      const fixtures = await syncFixtures(comp);
      const { count, matches } = await syncResults(comp);
      results[comp] = { fixtures, scored: count, scoredMatches: matches };
    } catch (err) {
      results[comp] = { error: err.message, fixtures: 0, scored: 0, scoredMatches: [] };
    }
  }
  return results;
}

async function getUpcoming(competitionName, limit = 10) {
  if (competitionName) {
    return db.query(
      `SELECT * FROM matches WHERE competition = $1 AND home_score IS NULL ORDER BY match_date ASC LIMIT $2`,
      [competitionName, limit]
    );
  }
  return db.query(
    `SELECT * FROM matches WHERE home_score IS NULL ORDER BY match_date ASC LIMIT $1`,
    [limit]
  );
}

async function getRecentResults(competitionName, limit = 10) {
  if (competitionName) {
    return db.query(
      `SELECT * FROM matches WHERE competition = $1 AND home_score IS NOT NULL ORDER BY match_date DESC LIMIT $2`,
      [competitionName, limit]
    );
  }
  return db.query(
    `SELECT * FROM matches WHERE home_score IS NOT NULL ORDER BY match_date DESC LIMIT $1`,
    [limit]
  );
}

module.exports = { syncAll, syncFixtures, syncResults, getUpcoming, getRecentResults };
