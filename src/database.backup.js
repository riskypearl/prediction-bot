const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'predictions.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competition TEXT NOT NULL CHECK(competition IN ('Premier League', 'World Cup')),
    home_team TEXT NOT NULL,
    away_team TEXT NOT NULL,
    match_date TEXT NOT NULL,
    kickoff_ts INTEGER DEFAULT NULL,
    home_score INTEGER DEFAULT NULL,
    away_score INTEGER DEFAULT NULL,
    locked INTEGER DEFAULT 0,
    api_id TEXT DEFAULT NULL UNIQUE,
    gameweek INTEGER DEFAULT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS predictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    match_id INTEGER NOT NULL,
    home_score INTEGER NOT NULL,
    away_score INTEGER NOT NULL,
    points INTEGER DEFAULT NULL,
    created_at TEXT DEFAULT (datetime('now')),
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
`);

// ── Match helpers ──────────────────────────────────────────────

function addMatch(competition, homeTeam, awayTeam, matchDate, gameweek = null, kickoffTs = null) {
  const stmt = db.prepare(`
    INSERT INTO matches (competition, home_team, away_team, match_date, gameweek, kickoff_ts)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(competition, homeTeam, awayTeam, matchDate, gameweek, kickoffTs);
}

function getMatch(id) {
  return db.prepare('SELECT * FROM matches WHERE id = ?').get(id);
}

function getUpcomingMatches(competition = null) {
  if (competition) {
    return db.prepare(`SELECT * FROM matches WHERE competition = ? AND home_score IS NULL ORDER BY match_date ASC LIMIT 10`).all(competition);
  }
  return db.prepare(`SELECT * FROM matches WHERE home_score IS NULL ORDER BY match_date ASC LIMIT 10`).all();
}

function getMatchesByGameweek(gameweek, competition = 'Premier League') {
  return db.prepare(`SELECT * FROM matches WHERE gameweek = ? AND competition = ? ORDER BY match_date ASC`).all(gameweek, competition);
}

function getMatchesByDate(dateStr) {
  return db.prepare(`SELECT * FROM matches WHERE match_date LIKE ? ORDER BY match_date ASC`).all(`${dateStr}%`);
}

function getUnlockedPastMatches() {
  const now = Math.floor(Date.now() / 1000);
  return db.prepare(`SELECT * FROM matches WHERE locked = 0 AND kickoff_ts IS NOT NULL AND kickoff_ts <= ? AND home_score IS NULL`).all(now);
}

function lockMatch(matchId) {
  return db.prepare('UPDATE matches SET locked = 1 WHERE id = ?').run(matchId);
}

function setResult(matchId, homeScore, awayScore) {
  db.prepare(`UPDATE matches SET home_score = ?, away_score = ?, locked = 1 WHERE id = ?`).run(homeScore, awayScore, matchId);
  return scoreMatch(matchId, homeScore, awayScore);
}

// ── Prediction helpers ─────────────────────────────────────────

function upsertPrediction(userId, username, matchId, homeScore, awayScore) {
  return db.prepare(`
    INSERT INTO predictions (user_id, username, match_id, home_score, away_score)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, match_id) DO UPDATE SET
      home_score = excluded.home_score,
      away_score = excluded.away_score,
      points = NULL
  `).run(userId, username, matchId, homeScore, awayScore);
}

function getUserPrediction(userId, matchId) {
  return db.prepare(`SELECT * FROM predictions WHERE user_id = ? AND match_id = ?`).get(userId, matchId);
}

function getPredictionsForMatch(matchId) {
  return db.prepare(`SELECT * FROM predictions WHERE match_id = ? ORDER BY username ASC`).all(matchId);
}

// ── Scoring (Option 3: distance-based) ────────────────────────

function getResult(h, a) {
  if (h > a) return 'H';
  if (a > h) return 'A';
  return 'D';
}

function calcPoints(predHome, predAway, actualHome, actualAway) {
  let points = 0;

  // Home goal scoring
  if (predHome === actualHome) points += 2;
  else if (Math.abs(predHome - actualHome) === 1) points += 1;

  // Away goal scoring
  if (predAway === actualAway) points += 2;
  else if (Math.abs(predAway - actualAway) === 1) points += 1;

  // Both exact bonus (brings total to 7)
  if (predHome === actualHome && predAway === actualAway) points += 3;

  // Correct result bonus
  if (getResult(predHome, predAway) === getResult(actualHome, actualAway)) points += 3;

  return points;
}

function scoreMatch(matchId, actualHome, actualAway) {
  const predictions = getPredictionsForMatch(matchId);
  const updatePoints = db.prepare(`UPDATE predictions SET points = ? WHERE id = ?`);

  const updateMany = db.transaction((preds) => {
    for (const pred of preds) {
      const points = calcPoints(pred.home_score, pred.away_score, actualHome, actualAway);
      updatePoints.run(points, pred.id);
      updateUserStats(pred.user_id, pred.username, points, pred.home_score, pred.away_score, actualHome, actualAway);
    }
  });

  updateMany(predictions);
  return predictions.length;
}

function updateUserStats(userId, username, points, predHome, predAway, actualHome, actualAway) {
  const existing = db.prepare('SELECT * FROM user_stats WHERE user_id = ?').get(userId);
  const isExact = predHome === actualHome && predAway === actualAway;
  const isCorrect = getResult(predHome, predAway) === getResult(actualHome, actualAway);
  const totalGoalDiff = Math.abs((predHome + predAway) - (actualHome + actualAway));
  const isClose = isCorrect && totalGoalDiff <= 1 && !isExact;

  if (!existing) {
    const streak = isCorrect ? 1 : 0;
    db.prepare(`
      INSERT INTO user_stats (user_id, username, total_points, exact_scores, correct_results, close_scores, current_streak, best_streak, predictions_scored)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(userId, username, points, isExact ? 1 : 0, isCorrect ? 1 : 0, isClose ? 1 : 0, streak, streak);
  } else {
    const newStreak = isCorrect ? existing.current_streak + 1 : 0;
    const bestStreak = Math.max(existing.best_streak, newStreak);
    db.prepare(`
      UPDATE user_stats SET
        username = ?,
        total_points = total_points + ?,
        exact_scores = exact_scores + ?,
        correct_results = correct_results + ?,
        close_scores = close_scores + ?,
        current_streak = ?,
        best_streak = ?,
        predictions_scored = predictions_scored + 1
      WHERE user_id = ?
    `).run(username, points, isExact ? 1 : 0, isCorrect ? 1 : 0, isClose ? 1 : 0, newStreak, bestStreak, userId);
  }
}

// ── Leaderboard ────────────────────────────────────────────────

function getLeaderboard(competition = null) {
  if (competition) {
    return db.prepare(`
      SELECT p.user_id, p.username,
        SUM(COALESCE(p.points,0)) as total_points,
        COUNT(CASE WHEN p.points IS NOT NULL THEN 1 END) as scored_predictions,
        COUNT(CASE WHEN p.points = 4 THEN 1 END) as exact_scores,
        COUNT(CASE WHEN p.points = 2 THEN 1 END) as close_scores,
        COUNT(CASE WHEN p.points = 1 THEN 1 END) as correct_results
      FROM predictions p
      JOIN matches m ON p.match_id = m.id
      WHERE m.competition = ?
      GROUP BY p.user_id, p.username
      ORDER BY total_points DESC, exact_scores DESC
      LIMIT 20
    `).all(competition);
  }
  return db.prepare(`
    SELECT user_id, username, total_points,
      exact_scores, close_scores, correct_results, predictions_scored,
      current_streak, best_streak
    FROM user_stats
    ORDER BY total_points DESC, exact_scores DESC
    LIMIT 20
  `).all();
}

function getGameweekLeaderboard(gameweek, competition = 'Premier League') {
  return db.prepare(`
    SELECT p.user_id, p.username,
      SUM(COALESCE(p.points,0)) as total_points,
      COUNT(CASE WHEN p.points = 4 THEN 1 END) as exact_scores,
      COUNT(CASE WHEN p.points = 2 THEN 1 END) as close_scores,
      COUNT(CASE WHEN p.points = 1 THEN 1 END) as correct_results
    FROM predictions p
    JOIN matches m ON p.match_id = m.id
    WHERE m.gameweek = ? AND m.competition = ? AND p.points IS NOT NULL
    GROUP BY p.user_id, p.username
    ORDER BY total_points DESC, exact_scores DESC
    LIMIT 20
  `).all(gameweek, competition);
}

function getDayLeaderboard(dateStr) {
  return db.prepare(`
    SELECT p.user_id, p.username,
      SUM(COALESCE(p.points,0)) as total_points,
      COUNT(CASE WHEN p.points = 4 THEN 1 END) as exact_scores,
      COUNT(CASE WHEN p.points = 2 THEN 1 END) as close_scores,
      COUNT(CASE WHEN p.points = 1 THEN 1 END) as correct_results
    FROM predictions p
    JOIN matches m ON p.match_id = m.id
    WHERE m.match_date LIKE ? AND p.points IS NOT NULL
    GROUP BY p.user_id, p.username
    ORDER BY total_points DESC, exact_scores DESC
    LIMIT 20
  `).all(`${dateStr}%`);
}

function getUserProfile(userId) {
  return db.prepare('SELECT * FROM user_stats WHERE user_id = ?').get(userId);
}

function getH2H(userId1, userId2) {
  return db.prepare(`
    SELECT
      p1.username as user1_name, p2.username as user2_name,
      SUM(COALESCE(p1.points,0)) as user1_points,
      SUM(COALESCE(p2.points,0)) as user2_points,
      COUNT(CASE WHEN p1.points > p2.points THEN 1 END) as user1_wins,
      COUNT(CASE WHEN p2.points > p1.points THEN 1 END) as user2_wins,
      COUNT(CASE WHEN p1.points = p2.points AND p1.points IS NOT NULL THEN 1 END) as draws
    FROM predictions p1
    JOIN predictions p2 ON p1.match_id = p2.match_id
    WHERE p1.user_id = ? AND p2.user_id = ? AND p1.points IS NOT NULL
  `).get(userId1, userId2);
}

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));
}

module.exports = {
  db, addMatch, getMatch, getUpcomingMatches, getMatchesByGameweek, getMatchesByDate,
  getUnlockedPastMatches, lockMatch, setResult, upsertPrediction, getUserPrediction,
  getPredictionsForMatch, getLeaderboard, getGameweekLeaderboard, getDayLeaderboard,
  getUserProfile, getH2H, getSetting, setSetting, calcPoints,
};
