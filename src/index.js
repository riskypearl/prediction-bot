require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const db = require('./database');
const { matchEmbed, matchListEmbed, leaderboardEmbed, errorEmbed, successEmbed } = require('./embeds');
const api = require('./football-api');

// ── Bot setup ──────────────────────────────────────────────────

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  client.user.setActivity('⚽ Prediction League', { type: 3 }); // "Watching"
});

// ── Helper: check if user is admin ────────────────────────────

function isAdmin(interaction) {
  return interaction.member?.permissions.has('ManageGuild');
}

// ── Command router ────────────────────────────────────────────

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    switch (interaction.commandName) {
      case 'predict':       return await handlePredict(interaction);
      case 'matches':       return await handleMatches(interaction);
      case 'mypredictions': return await handleMyPredictions(interaction);
      case 'leaderboard':   return await handleLeaderboard(interaction);
      case 'addmatch':      return await handleAddMatch(interaction);
      case 'setresult':     return await handleSetResult(interaction);
      case 'lockmatch':     return await handleLockMatch(interaction);
      case 'matchpredictions': return await handleMatchPredictions(interaction);
      case 'fixtures':          return await handleFixtures(interaction);
      case 'results':           return await handleResults(interaction);
      case 'sync':              return await handleSync(interaction);
    }
  } catch (err) {
    console.error(`Error in /${interaction.commandName}:`, err);
    const embed = errorEmbed('Something went wrong. Please try again.');
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ embeds: [embed], ephemeral: true });
    } else {
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }
});

// ── /predict ──────────────────────────────────────────────────

async function handlePredict(interaction) {
  const matchId   = interaction.options.getInteger('match_id');
  const homeScore = interaction.options.getInteger('home_score');
  const awayScore = interaction.options.getInteger('away_score');

  const match = db.getMatch(matchId);

  if (!match) {
    return interaction.reply({ embeds: [errorEmbed(`Match #${matchId} not found.`)], ephemeral: true });
  }

  if (match.locked) {
    return interaction.reply({ embeds: [errorEmbed(`Match #${matchId} is locked. No more predictions!`)], ephemeral: true });
  }

  if (match.home_score !== null) {
    return interaction.reply({ embeds: [errorEmbed(`Match #${matchId} has already been played.`)], ephemeral: true });
  }

  db.upsertPrediction(
    interaction.user.id,
    interaction.user.username,
    matchId,
    homeScore,
    awayScore
  );

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle('✅ Prediction Saved!')
    .setDescription(`**${match.home_team}** ${homeScore} – ${awayScore} **${match.away_team}**`)
    .addFields(
      { name: 'Match', value: `#${matchId} · ${match.competition}`, inline: true },
      { name: 'Date', value: match.match_date, inline: true },
    )
    .setFooter({ text: 'You can update your prediction any time before the match is locked.' });

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

// ── /matches ──────────────────────────────────────────────────

async function handleMatches(interaction) {
  const competition = interaction.options.getString('competition');
  const matches = db.getUpcomingMatches(competition);
  return interaction.reply({ embeds: [matchListEmbed(matches, competition)] });
}

// ── /mypredictions ────────────────────────────────────────────

async function handleMyPredictions(interaction) {
  const userId = interaction.user.id;

  // Get all upcoming unscored matches the user has predicted
  const rows = db.db.prepare(`
    SELECT m.id, m.competition, m.home_team, m.away_team, m.match_date, m.locked,
           p.home_score as pred_home, p.away_score as pred_away, p.points
    FROM predictions p
    JOIN matches m ON p.match_id = m.id
    WHERE p.user_id = ?
    ORDER BY m.match_date DESC
    LIMIT 20
  `).all(userId);

  if (rows.length === 0) {
    return interaction.reply({
      embeds: [errorEmbed("You haven't made any predictions yet. Use `/matches` to see upcoming games!")],
      ephemeral: true
    });
  }

  const lines = rows.map(r => {
    const lock  = r.locked ? ' 🔒' : '';
    const pts   = r.points !== null ? ` · **${r.points}pts**` : '';
    const result = r.points !== null
      ? (r.points === 3 ? ' 🎯' : r.points === 1 ? ' ✅' : ' ❌')
      : '';
    return `**#${r.id}** ${r.home_team} vs ${r.away_team}${lock}\n` +
           `Your pick: **${r.pred_home}–${r.pred_away}**${pts}${result} · ${r.match_date}`;
  });

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`📋 ${interaction.user.username}'s Predictions`)
    .setDescription(lines.join('\n\n'))
    .setFooter({ text: '🎯 Exact = 3pts · ✅ Result = 1pt · ❌ Wrong = 0pts' });

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

// ── /leaderboard ──────────────────────────────────────────────

async function handleLeaderboard(interaction) {
  const competition = interaction.options.getString('competition');
  const filter = competition === 'overall' ? null : competition;
  const rows = db.getLeaderboard(filter);
  return interaction.reply({ embeds: [leaderboardEmbed(rows, competition)] });
}

// ── /addmatch (admin) ─────────────────────────────────────────

async function handleAddMatch(interaction) {
  if (!isAdmin(interaction)) {
    return interaction.reply({ embeds: [errorEmbed('You need the **Manage Server** permission to use this.')], ephemeral: true });
  }

  const competition = interaction.options.getString('competition');
  const homeTeam    = interaction.options.getString('home_team');
  const awayTeam    = interaction.options.getString('away_team');
  const matchDate   = interaction.options.getString('match_date');

  const result = db.addMatch(competition, homeTeam, awayTeam, matchDate);
  const match  = db.getMatch(result.lastInsertRowid);

  return interaction.reply({
    embeds: [matchEmbed(match, `✅ Match #${match.id} Added`)],
    ephemeral: false
  });
}

// ── /setresult (admin) ────────────────────────────────────────

async function handleSetResult(interaction) {
  if (!isAdmin(interaction)) {
    return interaction.reply({ embeds: [errorEmbed('You need the **Manage Server** permission to use this.')], ephemeral: true });
  }

  const matchId   = interaction.options.getInteger('match_id');
  const homeScore = interaction.options.getInteger('home_score');
  const awayScore = interaction.options.getInteger('away_score');

  const match = db.getMatch(matchId);
  if (!match) {
    return interaction.reply({ embeds: [errorEmbed(`Match #${matchId} not found.`)], ephemeral: true });
  }

  const count = db.setResult(matchId, homeScore, awayScore);

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle(`✅ Result Set — Match #${matchId}`)
    .setDescription(`**${match.home_team}** ${homeScore} – ${awayScore} **${match.away_team}**`)
    .addFields({ name: 'Points Awarded', value: `Scored ${count} prediction(s)` })
    .setFooter({ text: '3pts exact score · 1pt correct result' });

  return interaction.reply({ embeds: [embed] });
}

// ── /lockmatch (admin) ────────────────────────────────────────

async function handleLockMatch(interaction) {
  if (!isAdmin(interaction)) {
    return interaction.reply({ embeds: [errorEmbed('You need the **Manage Server** permission to use this.')], ephemeral: true });
  }

  const matchId = interaction.options.getInteger('match_id');
  const match   = db.getMatch(matchId);

  if (!match) {
    return interaction.reply({ embeds: [errorEmbed(`Match #${matchId} not found.`)], ephemeral: true });
  }

  db.lockMatch(matchId);

  return interaction.reply({
    embeds: [successEmbed(`Match #${matchId} (**${match.home_team}** vs **${match.away_team}**) is now locked. No more predictions!`)]
  });
}

// ── /matchpredictions (admin) ─────────────────────────────────

async function handleMatchPredictions(interaction) {
  if (!isAdmin(interaction)) {
    return interaction.reply({ embeds: [errorEmbed('You need the **Manage Server** permission to use this.')], ephemeral: true });
  }

  const matchId = interaction.options.getInteger('match_id');
  const match   = db.getMatch(matchId);

  if (!match) {
    return interaction.reply({ embeds: [errorEmbed(`Match #${matchId} not found.`)], ephemeral: true });
  }

  const preds = db.getPredictionsForMatch(matchId);

  if (preds.length === 0) {
    return interaction.reply({
      embeds: [errorEmbed(`No predictions yet for Match #${matchId}.`)],
      ephemeral: true
    });
  }

  const lines = preds.map(p => {
    const pts = p.points !== null ? ` → **${p.points}pts**` : '';
    return `**${p.username}**: ${p.home_score}–${p.away_score}${pts}`;
  });

  const result = match.home_score !== null
    ? `Result: **${match.home_score}–${match.away_score}**`
    : 'Result: Pending';

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`📋 Predictions — #${matchId} ${match.home_team} vs ${match.away_team}`)
    .setDescription(`${result}\n\n${lines.join('\n')}`)
    .setFooter({ text: `${preds.length} prediction(s)` });

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

// ── Start ─────────────────────────────────────────────────────

client.login(process.env.DISCORD_TOKEN);

// ── /fixtures ─────────────────────────────────────────────────

async function handleFixtures(interaction) {
  await interaction.deferReply();
  const competition = interaction.options.getString('competition');
  const matches = api.getUpcoming(competition, 10);

  if (matches.length === 0) {
    return interaction.editReply({
      embeds: [errorEmbed('No upcoming fixtures found. Try `/sync` to fetch the latest from the API.')]
    });
  }

  const lines = matches.map(m =>
    `**#${m.id}** ${m.home_team} vs ${m.away_team}\n📅 ${m.match_date} · ${m.competition}`
  );

  const { EmbedBuilder } = require('discord.js');
  const embed = new EmbedBuilder()
    .setColor(0x3d195b)
    .setTitle(competition ? `📅 Upcoming ${competition} Fixtures` : '📅 Upcoming Fixtures')
    .setDescription(lines.join('\n\n'))
    .setFooter({ text: 'Use /predict <match_id> to submit your prediction' });

  return interaction.editReply({ embeds: [embed] });
}

// ── /results ──────────────────────────────────────────────────

async function handleResults(interaction) {
  await interaction.deferReply();
  const competition = interaction.options.getString('competition');
  const matches = api.getRecentResults(competition, 10);

  if (matches.length === 0) {
    return interaction.editReply({
      embeds: [errorEmbed('No results found yet. Try `/sync` to fetch the latest from the API.')]
    });
  }

  const lines = matches.map(m =>
    `**${m.home_team}** ${m.home_score} – ${m.away_score} **${m.away_team}**\n📅 ${m.match_date} · ${m.competition}`
  );

  const { EmbedBuilder } = require('discord.js');
  const embed = new EmbedBuilder()
    .setColor(0xc8aa5a)
    .setTitle(competition ? `📊 Recent ${competition} Results` : '📊 Recent Results')
    .setDescription(lines.join('\n\n'));

  return interaction.editReply({ embeds: [embed] });
}

// ── /sync (admin) ─────────────────────────────────────────────

async function handleSync(interaction) {
  if (!isAdmin(interaction)) {
    return interaction.reply({ embeds: [errorEmbed('You need the **Manage Server** permission to use this.')], ephemeral: true });
  }

  await interaction.deferReply();

  try {
    const results = await api.syncAll();
    const lines = Object.entries(results).map(([comp, r]) => {
      if (r.error) return `❌ **${comp}**: ${r.error}`;
      return `✅ **${comp}**: ${r.fixtures} fixtures synced, ${r.scored} predictions scored`;
    });

    const { EmbedBuilder } = require('discord.js');
    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle('🔄 Sync Complete')
      .setDescription(lines.join('\n'));

    return interaction.editReply({ embeds: [embed] });
  } catch (err) {
    return interaction.editReply({ embeds: [errorEmbed(`Sync failed: ${err.message}`)] });
  }
}

// ── Auto-sync every 30 minutes ────────────────────────────────

async function autoSync() {
  try {
    console.log('🔄 Auto-syncing fixtures and results...');
    const results = await api.syncAll();
    for (const [comp, r] of Object.entries(results)) {
      if (r.error) console.error(`  ❌ ${comp}: ${r.error}`);
      else console.log(`  ✅ ${comp}: ${r.fixtures} fixtures, ${r.scored} scored`);
    }
  } catch (err) {
    console.error('Auto-sync error:', err.message);
  }
}

client.once('ready', () => {
  // Run once on startup, then every 30 minutes
  setTimeout(() => {
    autoSync();
    setInterval(autoSync, 30 * 60 * 1000);
  }, 5000); // wait 5s after ready
});
