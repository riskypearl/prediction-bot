const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('railway')
    ? { rejectUnauthorized: false }
    : false,
});

// ── Init tables ────────────────────────────────────────────────

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS matches (
      id SERIAL PRIMARY KEY,
      competition TEXT NOT NULL CHECK(competition IN ('Premier League', 'World Cup')),
      home_team TEXT NOT NULL,
      away_team TEXT NOT NULL,
      match_date TEXT NOT NULL,
      kickoff_ts BIGINT DEFAULT NULL,
      home_score INTEGER DEFAULT NULL,
      away_score INTEGER DEFAULT NULL,
      locked INTEGER DEFAULT 0,
      api_id TEXT DEFAULT NULL UNIQUE,
      gameweek INTEGER DEFAULT NULL,
      created_at TEXT DEFAULT (NOW()::TEXT)
    );

    CREATE TABLE IF NOT EXISTS predictions (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      match_id INTEGER NOT NULL,
      home_score INTEGER NOT NULL,
      away_score INTEGER NOT NULL,
      points INTEGER DEFAULT NULL,
      created_at TEXT DEFAULT (NOW()::TEXT),
      UNIQUE(user_id, match_id),
      FOREIGN KEY(match_id) REFERENCES matches(id)
    );

    CREATE TABLE IF NOT EXISTS user_stats (
      user_id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      total_points INTEGER DEFAULT 0,
      exact_scores INTEGER DEFAULT 0,
      correct_results INTEGER DEFAULT 0,
      close_scores INTEGER DEFAULT 0,
      current_streak INTEGER DEFAULT 0,
      best_streak INTEGER DEFAULT 0,
      predictions_scored INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS prediction_audit_log (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      match_id INTEGER NOT NULL,
      old_home_score INTEGER DEFAULT NULL,
      old_away_score INTEGER DEFAULT NULL,
      new_home_score INTEGER NOT NULL,
      new_away_score INTEGER NOT NULL,
      changed_at TEXT DEFAULT (NOW()::TEXT)
    );
  `);
}

init().catch(console.error);

// ── Helper: run query and return rows ──────────────────────────

async function query(sql, params = []) {
  const res = await pool.query(sql, params);
  return res.rows;
}

async function queryOne(sql, params = []) {
  const res = await pool.query(sql, params);
  return res.rows[0] || null;
}

async function execute(sql, params = []) {
  const res = await pool.query(sql, params);
  return res;
}

// Expose a db-like object for raw queries used in index.js
const db = {
  prepare: () => { throw new Error('Use async db functions instead of db.prepare()'); },
  query: (sql, params) => query(sql, params),
  queryOne: (sql, params) => queryOne(sql, params),
  // Used in index.js: db.db.prepare(...)
  db: {
    prepare: (sql) => ({
      all: (...params) => query(sql.replace(/\?/g, (_, i) => `$${++i}`), params.flat()),
      get: (...params) => queryOne(sql.replace(/\?/g, (_, i) => `$${++i}`), params.flat()),
      run: (...params) => execute(sql.replace(/\?/g, (_, i) => `$${++i}`), params.flat()),
    }),
  },
};

// ── Match helpers ──────────────────────────────────────────────

async function addMatch(competition, homeTeam, awayTeam, matchDate, gameweek = null, kickoffTs = null) {
  const res = await pool.query(
    `INSERT INTO matches (competition, home_team, away_team, match_date, gameweek, kickoff_ts)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [competition, homeTeam, awayTeam, matchDate, gameweek, kickoffTs]
  );
  return { lastInsertRowid: res.rows[0].id };
}

async function getMatch(id) {
  return queryOne('SELECT * FROM matches WHERE id = $1', [id]);
}

async function getUpcomingMatches(competition = null) {
  if (competition) {
    return query(
      `SELECT * FROM matches WHERE competition = $1 AND home_score IS NULL ORDER BY match_date ASC LIMIT 10`,
      [competition]
    );
  }
  return query(`SELECT * FROM matches WHERE home_score IS NULL ORDER BY match_date ASC LIMIT 10`);
}

async function getMatchesByGameweek(gameweek, competition = 'Premier League') {
  return query(
    `SELECT * FROM matches WHERE gameweek = $1 AND competition = $2 ORDER BY match_date ASC`,
    [gameweek, competition]
  );
}

async function getMatchesByDate(dateStr) {
  return query(
    `SELECT * FROM matches WHERE match_date LIKE $1 ORDER BY match_date ASC`,
    [`${dateStr}%`]
  );
}

async function getUnlockedPastMatches() {
  const now = Math.floor(Date.now() / 1000);
  return query(
    `SELECT * FROM matches WHERE locked = 0 AND kickoff_ts IS NOT NULL AND kickoff_ts <= $1 AND home_score IS NULL`,
    [now]
  );
}

async function lockMatch(matchId) {
  return execute('UPDATE matches SET locked = 1 WHERE id = $1', [matchId]);
}

async function setResult(matchId, homeScore, awayScore) {
  await execute(
    `UPDATE matches SET home_score = $1, away_score = $2, locked = 1 WHERE id = $3`,
    [homeScore, awayScore, matchId]
  );
  return scoreMatch(matchId, homeScore, awayScore);
}

// ── Prediction helpers ─────────────────────────────────────────

async function upsertPrediction(userId, username, matchId, homeScore, awayScore) {
  return execute(
    `INSERT INTO predictions (user_id, username, match_id, home_score, away_score)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT(user_id, match_id) DO UPDATE SET
       home_score = EXCLUDED.home_score,
       away_score = EXCLUDED.away_score,
       points = NULL`,
    [userId, username, matchId, homeScore, awayScore]
  );
}

async function logPredictionAudit(userId, username, matchId, oldHomeScore, oldAwayScore, newHomeScore, newAwayScore) {
  await execute(
    `INSERT INTO prediction_audit_log (user_id, username, match_id, old_home_score, old_away_score, new_home_score, new_away_score)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [userId, username, matchId, oldHomeScore ?? null, oldAwayScore ?? null, newHomeScore, newAwayScore]
  );
}

async function upsertPredictionWithAudit(userId, username, matchId, homeScore, awayScore) {
  const existing = await getUserPrediction(userId, matchId);
  await upsertPrediction(userId, username, matchId, homeScore, awayScore);
  await logPredictionAudit(
    userId, username, matchId,
    existing ? existing.home_score : null,
    existing ? existing.away_score : null,
    homeScore, awayScore
  );
}

async function getRecentAuditLog(userId = null, matchId = null) {
  if (userId && matchId) {
    return query(
      `SELECT a.*, m.home_team, m.away_team FROM prediction_audit_log a
       JOIN matches m ON a.match_id = m.id
       WHERE a.user_id = $1 AND a.match_id = $2
       ORDER BY a.changed_at DESC LIMIT 10`,
      [userId, matchId]
    );
  } else if (userId) {
    return query(
      `SELECT a.*, m.home_team, m.away_team FROM prediction_audit_log a
       JOIN matches m ON a.match_id = m.id
       WHERE a.user_id = $1
       ORDER BY a.changed_at DESC LIMIT 10`,
      [userId]
    );
  } else if (matchId) {
    return query(
      `SELECT a.*, m.home_team, m.away_team FROM prediction_audit_log a
       JOIN matches m ON a.match_id = m.id
       WHERE a.match_id = $1
       ORDER BY a.changed_at DESC LIMIT 10`,
      [matchId]
    );
  }
  return query(
    `SELECT a.*, m.home_team, m.away_team FROM prediction_audit_log a
     JOIN matches m ON a.match_id = m.id
     ORDER BY a.changed_at DESC LIMIT 10`
  );
}

async function getCurrentGWMatches() {
  const gwRows = await query(
    `SELECT DISTINCT competition, gameweek FROM matches
     WHERE gameweek IS NOT NULL AND home_score IS NULL AND locked = 0
     ORDER BY gameweek ASC LIMIT 1`
  );
  if (gwRows.length > 0) {
    const { competition, gameweek } = gwRows[0];
    const matches = await query(
      `SELECT * FROM matches WHERE gameweek = $1 AND competition = $2 AND home_score IS NULL AND locked = 0 ORDER BY match_date ASC`,
      [gameweek, competition]
    );
    return { matches, label: `GW${gameweek} · ${competition}` };
  }
  const dateRows = await query(
    `SELECT DISTINCT match_date FROM matches
     WHERE gameweek IS NULL AND home_score IS NULL AND locked = 0
     ORDER BY match_date ASC LIMIT 1`
  );
  if (dateRows.length > 0) {
    const nextDate = dateRows[0].match_date;
    const matches = await query(
      `SELECT * FROM matches WHERE match_date LIKE $1 AND home_score IS NULL AND locked = 0 ORDER BY match_date ASC`,
      [`${nextDate}%`]
    );
    return { matches, label: nextDate };
  }
  return { matches: [], label: '' };
}

async function getUserPrediction(userId, matchId) {
  return queryOne(
    `SELECT * FROM predictions WHERE user_id = $1 AND match_id = $2`,
    [userId, matchId]
  );
}

async function getPredictionsForMatch(matchId) {
  return query(
    `SELECT * FROM predictions WHERE match_id = $1 ORDER BY username ASC`,
    [matchId]
  );
}

// ── Scoring ────────────────────────────────────────────────────

function getResult(h, a) {
  if (h > a) return 'H';
  if (a > h) return 'A';
  return 'D';
}

function calcPoints(predHome, predAway, actualHome, actualAway) {
  let points = 0;
  if (predHome === actualHome) points += 2;
  else if (Math.abs(predHome - actualHome) === 1) points += 1;
  if (predAway === actualAway) points += 2;
  else if (Math.abs(predAway - actualAway) === 1) points += 1;
  if (predHome === actualHome && predAway === actualAway) points += 3;
  if (getResult(predHome, predAway) === getResult(actualHome, actualAway)) points += 3;
  return points;
}

async function scoreMatch(matchId, actualHome, actualAway) {
  const predictions = await getPredictionsForMatch(matchId);
  for (const pred of predictions) {
    const points = calcPoints(pred.home_score, pred.away_score, actualHome, actualAway);
    await execute(`UPDATE predictions SET points = $1 WHERE id = $2`, [points, pred.id]);
    await updateUserStats(pred.user_id, pred.username, points, pred.home_score, pred.away_score, actualHome, actualAway);
  }
  return predictions.length;
}

async function updateUserStats(userId, username, points, predHome, predAway, actualHome, actualAway) {
  const existing = await queryOne('SELECT * FROM user_stats WHERE user_id = $1', [userId]);
  const isExact = predHome === actualHome && predAway === actualAway;
  const isCorrect = getResult(predHome, predAway) === getResult(actualHome, actualAway);
  const totalGoalDiff = Math.abs((predHome + predAway) - (actualHome + actualAway));
  const isClose = isCorrect && totalGoalDiff <= 1 && !isExact;

  if (!existing) {
    const streak = isCorrect ? 1 : 0;
    await execute(
      `INSERT INTO user_stats (user_id, username, total_points, exact_scores, correct_results, close_scores, current_streak, best_streak, predictions_scored)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1)`,
      [userId, username, points, isExact ? 1 : 0, isCorrect ? 1 : 0, isClose ? 1 : 0, streak, streak]
    );
  } else {
    const newStreak = isCorrect ? existing.current_streak + 1 : 0;
    const bestStreak = Math.max(existing.best_streak, newStreak);
    await execute(
      `UPDATE user_stats SET
        username = $1,
        total_points = total_points + $2,
        exact_scores = exact_scores + $3,
        correct_results = correct_results + $4,
        close_scores = close_scores + $5,
        current_streak = $6,
        best_streak = $7,
        predictions_scored = predictions_scored + 1
       WHERE user_id = $8`,
      [username, points, isExact ? 1 : 0, isCorrect ? 1 : 0, isClose ? 1 : 0, newStreak, bestStreak, userId]
    );
  }
}

// ── Leaderboard ────────────────────────────────────────────────

async function getLeaderboard(competition = null) {
  if (competition) {
    return query(
      `SELECT p.user_id, p.username,
        SUM(COALESCE(p.points,0)) as total_points,
        COUNT(CASE WHEN p.points IS NOT NULL THEN 1 END) as scored_predictions,
        COUNT(CASE WHEN p.points = 4 THEN 1 END) as exact_scores,
        COUNT(CASE WHEN p.points = 2 THEN 1 END) as close_scores,
        COUNT(CASE WHEN p.points = 1 THEN 1 END) as correct_results
       FROM predictions p
       JOIN matches m ON p.match_id = m.id
       WHERE m.competition = $1
       GROUP BY p.user_id, p.username
       ORDER BY total_points DESC, exact_scores DESC
       LIMIT 20`,
      [competition]
    );
  }
  return query(
    `SELECT user_id, username, total_points,
      exact_scores, close_scores, correct_results, predictions_scored,
      current_streak, best_streak
     FROM user_stats
     ORDER BY total_points DESC, exact_scores DESC
     LIMIT 20`
  );
}

async function getGameweekLeaderboard(gameweek, competition = 'Premier League') {
  return query(
    `SELECT p.user_id, p.username,
      SUM(COALESCE(p.points,0)) as total_points,
      COUNT(CASE WHEN p.points = 4 THEN 1 END) as exact_scores,
      COUNT(CASE WHEN p.points = 2 THEN 1 END) as close_scores,
      COUNT(CASE WHEN p.points = 1 THEN 1 END) as correct_results
     FROM predictions p
     JOIN matches m ON p.match_id = m.id
     WHERE m.gameweek = $1 AND m.competition = $2 AND p.points IS NOT NULL
     GROUP BY p.user_id, p.username
     ORDER BY total_points DESC, exact_scores DESC
     LIMIT 20`,
    [gameweek, competition]
  );
}

async function getDayLeaderboard(dateStr) {
  return query(
    `SELECT p.user_id, p.username,
      SUM(COALESCE(p.points,0)) as total_points,
      COUNT(CASE WHEN p.points = 4 THEN 1 END) as exact_scores,
      COUNT(CASE WHEN p.points = 2 THEN 1 END) as close_scores,
      COUNT(CASE WHEN p.points = 1 THEN 1 END) as correct_results
     FROM predictions p
     JOIN matches m ON p.match_id = m.id
     WHERE m.match_date LIKE $1 AND p.points IS NOT NULL
     GROUP BY p.user_id, p.username
     ORDER BY total_points DESC, exact_scores DESC
     LIMIT 20`,
    [`${dateStr}%`]
  );
}

async function getUserProfile(userId) {
  return queryOne('SELECT * FROM user_stats WHERE user_id = $1', [userId]);
}

async function getH2H(userId1, userId2) {
  return queryOne(
    `SELECT
      p1.username as user1_name, p2.username as user2_name,
      SUM(COALESCE(p1.points,0)) as user1_points,
      SUM(COALESCE(p2.points,0)) as user2_points,
      COUNT(CASE WHEN p1.points > p2.points THEN 1 END) as user1_wins,
      COUNT(CASE WHEN p2.points > p1.points THEN 1 END) as user2_wins,
      COUNT(CASE WHEN p1.points = p2.points AND p1.points IS NOT NULL THEN 1 END) as draws
     FROM predictions p1
     JOIN predictions p2 ON p1.match_id = p2.match_id
     WHERE p1.user_id = $1 AND p2.user_id = $2 AND p1.points IS NOT NULL`,
    [userId1, userId2]
  );
}

async function getSetting(key) {
  const row = await queryOne('SELECT value FROM settings WHERE key = $1', [key]);
  return row ? row.value : null;
}

async function setSetting(key, value) {
  await execute(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value`,
    [key, String(value)]
  );
}

module.exports = {
  db, query, queryOne, addMatch, getMatch, getUpcomingMatches, getMatchesByGameweek, getMatchesByDate,
  getUnlockedPastMatches, lockMatch, setResult, upsertPrediction, upsertPredictionWithAudit,
  logPredictionAudit, getUserPrediction, getRecentAuditLog, getCurrentGWMatches,
  getPredictionsForMatch, getLeaderboard, getGameweekLeaderboard, getDayLeaderboard,
  getUserProfile, getH2H, getSetting, setSetting, calcPoints,
};
