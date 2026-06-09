/**
 * src/api.js — Express admin API
 * Runs on PORT (default 3000) alongside the Discord bot.
 * All routes require the Authorization header to match ADMIN_API_KEY.
 */

const express = require('express');
const cors    = require('cors');
const db      = require('./database');

const app = express();
app.use(cors());
app.use(express.json());

// ── Auth middleware ───────────────────────────────────────────

function requireApiKey(req, res, next) {
  const apiKey = process.env.ADMIN_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ADMIN_API_KEY not configured on server.' });
  }
  const provided = req.headers['authorization'];
  if (!provided || provided !== `Bearer ${apiKey}`) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }
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
      upcoming_matches:   parseInt(upcoming?.c   ?? 0),
      locked_matches:     parseInt(locked?.c     ?? 0),
      total_predictions:  parseInt(predictions?.c ?? 0),
      unique_users:       parseInt(users?.c       ?? 0),
      last_sync:          lastSync ?? null,
      current_gw: {
        label:       gwLabel || null,
        match_count: gwMatches.length,
        matches:     gwMatches.map(m => ({
          id:        m.id,
          home_team: m.home_team,
          away_team: m.away_team,
          match_date: m.match_date,
          kickoff_ts: m.kickoff_ts,
        })),
      },
    });
  } catch (err) {
    console.error('API /overview error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── GET /api/admin/leaderboard ────────────────────────────────
// Query params: competition (optional), gameweek (optional integer)

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
// Query params: user_id (optional), match_id (optional), limit (optional, max 50)

app.get('/api/admin/audit', async (req, res) => {
  try {
    const { user_id, match_id, limit } = req.query;
    const safeLimit = Math.min(parseInt(limit) || 20, 50);

    // getRecentAuditLog already filters by user_id and/or match_id
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
// Body: { reminder_window?, remindmissing_dms?, reveal_predictions? }

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

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid settings provided.' });
    }

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