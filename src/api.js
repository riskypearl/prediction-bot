/**
 * src/api.js — Express admin API
 */

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const db      = require('./database');

const app = express();
app.use(cors());
app.use(express.json());

// ── Admin dashboard ───────────────────────────────────────────

app.get('/admin', (req, res) => {
  const apiKey = process.env.ADMIN_API_KEY || '';
  // Inject the API key as a meta tag into the HTML file
  const fs = require('fs');
  const filePath = path.join(__dirname, '..', 'public', 'admin.html');
  let html = fs.readFileSync(filePath, 'utf8');
  html = html.replace('</head>', `<meta name="api-key" content="${apiKey}"/></head>`);
  res.send(html);
});

// ── Auth middleware ───────────────────────────────────────────

function requireApiKey(req, res, next) {
  const apiKey = process.env.ADMIN_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ADMIN_API_KEY not configured.' });
  const provided = req.headers['authorization'];
  if (!provided || provided !== `Bearer ${apiKey}`) return res.status(401).json({ error: 'Unauthorized.' });
  next();
}

app.use('/api/admin', requireApiKey);

// ── GET /api/admin/overview ───────────────────────────────────

app.get('/api/admin/overview', async (req, res) => {
  try {
    const [upcoming, locked, predictions, users, lastSync] = await Promise.all([
      db.queryOne(`SELECT COUNT(*) as c FROM matches WHERE home_score IS NULL AND locked = 0`),
      db.queryOne(`SELECT COUNT(*) as c FROM matches WHERE locked = 1`),
      db.queryOne(`SELECT COUNT(*) as c FROM predictions`),
      db.queryOne(`SELECT COUNT(DISTINCT user_id) as c FROM predictions`),
      db.getSetting('last_sync'),
    ]);
    const { matches: gwMatches, label: gwLabel } = await db.getCurrentGWMatches();
    res.json({
      upcoming_matches:  parseInt(upcoming?.c  ?? 0),
      locked_matches:    parseInt(locked?.c    ?? 0),
      total_predictions: parseInt(predictions?.c ?? 0),
      unique_users:      parseInt(users?.c      ?? 0),
      last_sync:         lastSync ?? null,
      current_gw: {
        label:       gwLabel || null,
        match_count: gwMatches.length,
        matches:     gwMatches.map(m => ({
          id: m.id, home_team: m.home_team, away_team: m.away_team,
          match_date: m.match_date, kickoff_ts: m.kickoff_ts,
        })),
      },
    });
  } catch (err) {
    console.error('API /overview error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── GET /api/admin/users ──────────────────────────────────────

app.get('/api/admin/users', async (req, res) => {
  try {
    const users = await db.query(
      `SELECT user_id, username, total_points, exact_scores, correct_results,
              close_scores, current_streak, best_streak, predictions_scored
       FROM user_stats ORDER BY total_points DESC, exact_scores DESC`
    );
    res.json({ users });
  } catch (err) {
    console.error('API /users error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── GET /api/admin/fixtures ───────────────────────────────────

app.get('/api/admin/fixtures', async (req, res) => {
  try {
    const fixtures = await db.query(`SELECT * FROM matches ORDER BY match_date DESC LIMIT 50`);
    res.json({ fixtures });
  } catch (err) {
    console.error('API /fixtures error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── POST /api/admin/lock-fixture/:id ─────────────────────────

app.post('/api/admin/lock-fixture/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const match = await db.getMatch(id);
    if (!match) return res.status(404).json({ error: 'Match not found.' });
    await db.lockMatch(id);
    console.log(`🔒 Admin locked match #${id}`);
    res.json({ success: true, id, locked: true });
  } catch (err) {
    console.error('API /lock-fixture error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── POST /api/admin/unlock-fixture/:id ───────────────────────

app.post('/api/admin/unlock-fixture/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const match = await db.getMatch(id);
    if (!match) return res.status(404).json({ error: 'Match not found.' });
    await db.unlockMatch(id);
    console.log(`🔓 Admin unlocked match #${id}`);
    res.json({ success: true, id, locked: false });
  } catch (err) {
    console.error('API /unlock-fixture error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── POST /api/admin/sync ──────────────────────────────────────

app.post('/api/admin/sync', async (req, res) => {
  try {
    const footballApi = require('./football-api');
    const results = await footballApi.syncAll();
    await db.setSetting('last_sync', new Date().toUTCString());
    console.log('🔄 Admin triggered sync');
    res.json({ success: true, results });
  } catch (err) {
    console.error('API /sync error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── POST /api/admin/remind ────────────────────────────────────

app.post('/api/admin/remind', async (req, res) => {
  try {
    const { matches, label } = await db.getCurrentGWMatches();
    if (matches.length === 0) return res.json({ success: true, sent: 0, message: 'No open fixtures.' });
    const matchIds = matches.map(m => m.id);
    const allUsers = await db.query(`SELECT DISTINCT user_id, username FROM predictions ORDER BY username ASC`);
    const missing = [];
    for (const user of allUsers) {
      const rows = await db.query(
        `SELECT COUNT(*) as c FROM predictions WHERE user_id = $1 AND match_id = ANY($2::int[])`,
        [user.user_id, matchIds]
      );
      const predicted = parseInt(rows[0]?.c ?? 0);
      if (matchIds.length - predicted > 0) missing.push(user.username);
    }
    console.log(`📬 Admin triggered reminders — ${missing.length} missing for ${label}`);
    res.json({ success: true, sent: missing.length, missing, label });
  } catch (err) {
    console.error('API /remind error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── GET /api/admin/leaderboard ────────────────────────────────

app.get('/api/admin/leaderboard', async (req, res) => {
  try {
    const { competition, gameweek } = req.query;
    let rows;
    if (gameweek) {
      rows = await db.getGameweekLeaderboard(parseInt(gameweek), competition || 'Premier League');
    } else {
      rows = await db.getLeaderboard(competition || null);
    }
    res.json({ leaderboard: rows });
  } catch (err) {
    console.error('API /leaderboard error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── GET /api/admin/audit ──────────────────────────────────────

app.get('/api/admin/audit', async (req, res) => {
  try {
    const { user_id, match_id, limit } = req.query;
    const safeLimit = Math.min(parseInt(limit) || 20, 50);
    const rows = await db.getRecentAuditLog(user_id || null, match_id ? parseInt(match_id) : null);
    res.json({ audit_log: rows.slice(0, safeLimit) });
  } catch (err) {
    console.error('API /audit error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── GET /api/admin/settings ───────────────────────────────────

app.get('/api/admin/settings', async (req, res) => {
  try {
    const [reminderWindow, remindmissingDms, revealPredictions, announcementChannel, lastSync] = await Promise.all([
      db.getSetting('reminder_window'),
      db.getSetting('remindmissing_dms'),
      db.getSetting('reveal_predictions'),
      db.getSetting('announcement_channel'),
      db.getSetting('last_sync'),
    ]);
    res.json({
      reminder_window:      reminderWindow      ?? 'off',
      remindmissing_dms:    remindmissingDms    === 'true',
      reveal_predictions:   revealPredictions   ?? 'after_lock',
      announcement_channel: announcementChannel ?? null,
      last_sync:            lastSync            ?? null,
    });
  } catch (err) {
    console.error('API /settings error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── PATCH /api/admin/settings ─────────────────────────────────

app.patch('/api/admin/settings', async (req, res) => {
  try {
    const allowed = ['reminder_window', 'remindmissing_dms', 'reveal_predictions'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        const value = String(req.body[key]);
        await db.setSetting(key, value);
        updates[key] = value;
      }
    }
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No valid settings provided.' });
    res.json({ updated: updates });
  } catch (err) {
    console.error('API PATCH /settings error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── Start ─────────────────────────────────────────────────────

function startApi() {
  const port = parseInt(process.env.API_PORT) || 3000;
  app.listen(port, () => {
    console.log(`🌐 Admin API listening on port ${port}`);
  });
}

module.exports = { startApi };