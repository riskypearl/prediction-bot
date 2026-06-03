const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'predictions.db'));

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competition TEXT NOT NULL CHECK(competition IN ('Premier League', 'World Cup')),
    home_team TEXT NOT NULL,
    away_team TEXT NOT NULL,
    match_date TEXT NOT NULL,
    home_score INTEGER DEFAULT NULL,
    away_score INTEGER DEFAULT NULL,
    locked INTEGER DEFAULT 0,
    api_id TEXT DEFAULT NULL UNIQUE,
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
`);

// ── Match helpers ──────────────────────────────────────────────

function addMatch(competition, homeTeam, awayTeam, matchDate) {
  const stmt = db.prepare(`
    INSERT INTO matches (competition, home_team, away_team, match_date)
    VALUES (?, ?, ?, ?)
  `);
  return stmt.run(competition, homeTeam, awayTeam, matchDate);
}

function getMatch(id) {
  return db.prepare('SELECT * FROM matches WHERE id = ?').get(id);
}

function getUpcomingMatches(competition = null) {
  if (competition) {
    return db.prepare(`
      SELECT * FROM matches
      WHERE competition = ? AND home_score IS NULL
      ORDER BY match_date ASC
      LIMIT 10
    `).all(competition);
  }
  return db.prepare(`
    SELECT * FROM matches
    WHERE home_score IS NULL
    ORDER BY match_date ASC
    LIMIT 10
  `).all();
}

function getAllMatches(competition = null) {
  if (competition) {
    return db.prepare(`
      SELECT * FROM matches WHERE competition = ?
      ORDER BY match_date DESC LIMIT 20
    `).all(competition);
  }
  return db.prepare(`
    SELECT * FROM matches ORDER BY match_date DESC LIMIT 20
  `).all();
}

function lockMatch(matchId) {
  return db.prepare('UPDATE matches SET locked = 1 WHERE id = ?').run(matchId);
}

function setResult(matchId, homeScore, awayScore) {
  db.prepare(`
    UPDATE matches SET home_score = ?, away_score = ?, locked = 1 WHERE id = ?
  `).run(homeScore, awayScore, matchId);
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
  return db.prepare(`
    SELECT * FROM predictions WHERE user_id = ? AND match_id = ?
  `).get(userId, matchId);
}

function getPredictionsForMatch(matchId) {
  return db.prepare(`
    SELECT * FROM predictions WHERE match_id = ?
    ORDER BY username ASC
  `).all(matchId);
}

// ── Scoring ────────────────────────────────────────────────────

function getResult(actualHome, actualAway) {
  if (actualHome > actualAway) return 'H';
  if (actualAway > actualHome) return 'A';
  return 'D';
}

function scoreMatch(matchId, actualHome, actualAway) {
  const predictions = getPredictionsForMatch(matchId);
  const updatePoints = db.prepare(`
    UPDATE predictions SET points = ? WHERE id = ?
  `);

  const updateMany = db.transaction((preds) => {
    for (const pred of preds) {
      let points = 0;
      const exactScore = pred.home_score === actualHome && pred.away_score === actualAway;
      const correctResult = getResult(pred.home_score, pred.away_score) === getResult(actualHome, actualAway);

      if (exactScore) {
        points = 3;
      } else if (correctResult) {
        points = 1;
      }

      updatePoints.run(points, pred.id);
    }
  });

  updateMany(predictions);
  return predictions.length;
}

// ── Leaderboard ────────────────────────────────────────────────

function getLeaderboard(competition = null) {
  if (competition) {
    return db.prepare(`
      SELECT
        p.user_id,
        p.username,
        SUM(COALESCE(p.points, 0)) as total_points,
        COUNT(CASE WHEN p.points IS NOT NULL THEN 1 END) as scored_predictions,
        COUNT(CASE WHEN p.points = 3 THEN 1 END) as exact_scores,
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
    SELECT
      p.user_id,
      p.username,
      SUM(COALESCE(p.points, 0)) as total_points,
      COUNT(CASE WHEN p.points IS NOT NULL THEN 1 END) as scored_predictions,
      COUNT(CASE WHEN p.points = 3 THEN 1 END) as exact_scores,
      COUNT(CASE WHEN p.points = 1 THEN 1 END) as correct_results
    FROM predictions p
    GROUP BY p.user_id, p.username
    ORDER BY total_points DESC, exact_scores DESC
    LIMIT 20
  `).all();
}

module.exports = {
  db,
  addMatch,
  getMatch,
  getUpcomingMatches,
  getAllMatches,
  lockMatch,
  setResult,
  upsertPrediction,
  getUserPrediction,
  getPredictionsForMatch,
  getLeaderboard,
};
