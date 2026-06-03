# ⚽ Prediction League Bot

A Discord bot for running a Premier League & World Cup prediction league. Users predict match scores and earn points based on accuracy.

## Scoring
| Prediction | Points |
|---|---|
| 🎯 Exact score | **3 pts** |
| ✅ Correct result (W/D/L) | **1 pt** |
| ❌ Wrong result | **0 pts** |

---

## Setup

### 1. Create your Discord bot

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. Click **New Application** → give it a name
3. Go to **Bot** → click **Add Bot**
4. Copy the **Token** (you'll need this)
5. Under **Privileged Gateway Intents**, enable **Server Members Intent** (optional but useful)
6. Go to **OAuth2 → URL Generator**:
   - Scopes: `bot`, `applications.commands`
   - Bot permissions: `Send Messages`, `Embed Links`, `Use Slash Commands`
7. Copy the generated URL and open it to invite the bot to your server

### 2. Get your IDs

- **Client ID**: Found on the **OAuth2** page of your app
- **Guild ID**: Right-click your Discord server → Copy Server ID  
  *(Enable Developer Mode in Discord settings first: User Settings → Advanced)*

### 3. Install & configure

```bash
# Install dependencies
npm install

# Copy the env template
cp .env.example .env
```

Edit `.env` and fill in your values:
```
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_client_id_here
GUILD_ID=your_guild_id_here
```

### 4. Register slash commands

```bash
npm run deploy
```

You should see: `✅ Slash commands registered successfully!`

### 5. Start the bot

```bash
npm start
```

You should see: `✅ Logged in as YourBot#1234`

---

## Commands

### 👤 User Commands

| Command | Description |
|---|---|
| `/matches` | View upcoming matches (optionally filter by competition) |
| `/predict <match_id> <home_score> <away_score>` | Submit or update your prediction |
| `/mypredictions` | View all your predictions and points |
| `/leaderboard` | See the standings (overall or by competition) |

### 🔒 Admin Commands
*(Requires **Manage Server** permission)*

| Command | Description |
|---|---|
| `/addmatch <competition> <home_team> <away_team> <date>` | Add a new match |
| `/lockmatch <match_id>` | Lock a match (no more predictions) |
| `/setresult <match_id> <home_score> <away_score>` | Set the result & auto-award points |
| `/matchpredictions <match_id>` | View everyone's predictions for a match |

---

## Typical workflow

```
Admin:  /addmatch competition:Premier League home_team:Arsenal away_team:Chelsea match_date:2024-05-12 16:30
Users:  /matches          ← see the new match with its ID
Users:  /predict 1 2 1   ← predict Arsenal 2-1 Chelsea
Admin:  /lockmatch 1      ← lock before kickoff
Admin:  /setresult 1 2 0  ← set the real score, points auto-awarded
All:    /leaderboard      ← check standings
```

---

## File structure

```
prediction-bot/
├── src/
│   ├── index.js           # Bot logic & command handlers
│   ├── database.js        # SQLite helpers
│   ├── embeds.js          # Discord embed builders
│   └── deploy-commands.js # Slash command registration
├── predictions.db         # Auto-created on first run
├── .env                   # Your secrets (never commit this!)
├── .env.example
└── package.json
```

## Hosting

To keep the bot running 24/7, consider:
- **[Railway](https://railway.app)** — free tier, easy deploys
- **[Fly.io](https://fly.io)** — free tier
- **[Render](https://render.com)** — free tier (spins down when idle)
- A cheap VPS (DigitalOcean, Hetzner, etc.)
