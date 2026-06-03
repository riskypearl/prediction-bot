require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const db = require('./database');
const { matchEmbed, matchListEmbed, leaderboardEmbed, profileEmbed, h2hEmbed, errorEmbed, successEmbed } = require('./embeds');
const api = require('./football-api');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  client.user.setActivity('⚽ Prediction League', { type: 3 });
  setTimeout(() => {
    autoSync();
    setInterval(autoSync, 30 * 60 * 1000);
    setInterval(autoLockMatches, 60 * 1000); // check every minute
  }, 5000);
});

function isAdmin(interaction) {
  return interaction.member?.permissions.has('ManageGuild');
}

async function getAnnouncementChannel() {
  const channelId = db.getSetting('announcement_channel');
  if (!channelId) return null;
  try { return await client.channels.fetch(channelId); } catch { return null; }
}

// ── Command router ────────────────────────────────────────────

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  try {
    switch (interaction.commandName) {
      case 'predict':          return await handlePredict(interaction);
      case 'matches':          return await handleMatches(interaction);
      case 'fixtures':         return await handleFixtures(interaction);
      case 'results':          return await handleResults(interaction);
      case 'mypredictions':    return await handleMyPredictions(interaction);
      case 'leaderboard':      return await handleLeaderboard(interaction);
      case 'profile':          return await handleProfile(interaction);
      case 'h2h':              return await handleH2H(interaction);
      case 'addmatch':         return await handleAddMatch(interaction);
      case 'setresult':        return await handleSetResult(interaction);
      case 'lockmatch':        return await handleLockMatch(interaction);
      case 'matchpredictions': return await handleMatchPredictions(interaction);
      case 'setchannel':       return await handleSetChannel(interaction);
      case 'sync':             return await handleSync(interaction);
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

  if (!match) return interaction.reply({ embeds: [errorEmbed(`Match #${matchId} not found.`)], ephemeral: true });
  if (match.locked) return interaction.reply({ embeds: [errorEmbed(`Match #${matchId} is locked!`)], ephemeral: true });
  if (match.home_score !== null) return interaction.reply({ embeds: [errorEmbed(`Match #${matchId} already played.`)], ephemeral: true });

  db.upsertPrediction(interaction.user.id, interaction.user.username, matchId, homeScore, awayScore);

  const gw = match.gameweek ? ` · GW${match.gameweek}` : '';
  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle('✅ Prediction Saved!')
    .setDescription(`**${match.home_team}** ${homeScore} – ${awayScore} **${match.away_team}**`)
    .addFields(
      { name: 'Match', value: `#${matchId} · ${match.competition}${gw}`, inline: true },
      { name: 'Date', value: match.match_date, inline: true },
    )
    .setFooter({ text: 'You can update your prediction any time before the match locks.' });

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

// ── /matches ──────────────────────────────────────────────────

async function handleMatches(interaction) {
  const competition = interaction.options.getString('competition');
  const gameweek    = interaction.options.getInteger('gameweek');

  let matches, title;
  if (gameweek && competition !== 'World Cup') {
    matches = db.getMatchesByGameweek(gameweek, competition || 'Premier League');
    title = `GW${gameweek} Matches`;
  } else {
    matches = db.getUpcomingMatches(competition);
    title = competition ? `Upcoming ${competition} Matches` : 'Upcoming Matches';
  }

  return interaction.reply({ embeds: [matchListEmbed(matches, title)] });
}

// ── /fixtures ─────────────────────────────────────────────────

async function handleFixtures(interaction) {
  await interaction.deferReply();
  const competition = interaction.options.getString('competition');
  const matches = api.getUpcoming(competition, 10);
  if (matches.length === 0) {
    return interaction.editReply({ embeds: [errorEmbed('No upcoming fixtures. Try `/sync` first.')] });
  }
  const lines = matches.map(m => {
    const gw = m.gameweek ? ` · GW${m.gameweek}` : '';
    return `**#${m.id}** ${m.home_team} vs ${m.away_team}\n📅 ${m.match_date}${gw} · ${m.competition}`;
  });
  const embed = new EmbedBuilder().setColor(0x3d195b)
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
    return interaction.editReply({ embeds: [errorEmbed('No results yet.')] });
  }
  const lines = matches.map(m => {
    const gw = m.gameweek ? ` · GW${m.gameweek}` : '';
    return `**${m.home_team}** ${m.home_score} – ${m.away_score} **${m.away_team}**\n📅 ${m.match_date}${gw}`;
  });
  const embed = new EmbedBuilder().setColor(0xc8aa5a)
    .setTitle(competition ? `📊 Recent ${competition} Results` : '📊 Recent Results')
    .setDescription(lines.join('\n\n'));
  return interaction.editReply({ embeds: [embed] });
}

// ── /mypredictions ────────────────────────────────────────────

async function handleMyPredictions(interaction) {
  const rows = db.db.prepare(`
    SELECT m.id, m.competition, m.home_team, m.away_team, m.match_date, m.locked, m.gameweek,
           p.home_score as pred_home, p.away_score as pred_away, p.points
    FROM predictions p JOIN matches m ON p.match_id = m.id
    WHERE p.user_id = ? ORDER BY m.match_date DESC LIMIT 20
  `).all(interaction.user.id);

  if (rows.length === 0) {
    return interaction.reply({ embeds: [errorEmbed("No predictions yet! Use `/matches` to see upcoming games.")], ephemeral: true });
  }

  const lines = rows.map(r => {
    const lock = r.locked ? ' 🔒' : '';
    const gw = r.gameweek ? ` · GW${r.gameweek}` : '';
    let pts = '';
    if (r.points !== null) {
      const icon = r.points === 4 ? '🎯' : r.points === 2 ? '📏' : r.points === 1 ? '✅' : '❌';
      pts = ` → **${r.points}pts** ${icon}`;
    }
    return `**#${r.id}** ${r.home_team} vs ${r.away_team}${lock}\nPick: **${r.pred_home}–${r.pred_away}**${pts} · ${r.match_date}${gw}`;
  });

  const embed = new EmbedBuilder().setColor(0x5865f2)
    .setTitle(`📋 ${interaction.user.username}'s Predictions`)
    .setDescription(lines.join('\n\n'))
    .setFooter({ text: '🎯 Exact=4pts · 📏 Close=2pts · ✅ Result=1pt' });

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

// ── /leaderboard ──────────────────────────────────────────────

async function handleLeaderboard(interaction) {
  const competition = interaction.options.getString('competition');
  const gameweek    = interaction.options.getInteger('gameweek');
  const date        = interaction.options.getString('date');

  let rows, title;
  if (gameweek) {
    rows = db.getGameweekLeaderboard(gameweek, competition || 'Premier League');
    title = `GW${gameweek} Leaderboard`;
  } else if (date) {
    rows = db.getDayLeaderboard(date);
    title = `${date} Leaderboard`;
  } else {
    const filter = competition === 'overall' ? null : competition;
    rows = db.getLeaderboard(filter);
    title = competition && competition !== 'overall' ? `${competition} Leaderboard` : 'Overall Leaderboard';
  }

  return interaction.reply({ embeds: [leaderboardEmbed(rows, title)] });
}

// ── /profile ──────────────────────────────────────────────────

async function handleProfile(interaction) {
  const target = interaction.options.getUser('user') || interaction.user;
  const stats = db.getUserProfile(target.id);
  if (!stats) {
    return interaction.reply({ embeds: [errorEmbed(`${target.username} hasn't made any predictions yet!`)], ephemeral: true });
  }
  return interaction.reply({ embeds: [profileEmbed(target, stats)] });
}

// ── /h2h ──────────────────────────────────────────────────────

async function handleH2H(interaction) {
  const user1 = interaction.options.getUser('user1');
  const user2 = interaction.options.getUser('user2');
  const h2h = db.getH2H(user1.id, user2.id);
  if (!h2h || h2h.user1_points === null) {
    return interaction.reply({ embeds: [errorEmbed('Not enough shared predictions to compare yet!')] });
  }
  return interaction.reply({ embeds: [h2hEmbed(h2h)] });
}

// ── /addmatch (admin) ─────────────────────────────────────────

async function handleAddMatch(interaction) {
  if (!isAdmin(interaction)) return interaction.reply({ embeds: [errorEmbed('No permission.')], ephemeral: true });
  const competition = interaction.options.getString('competition');
  const homeTeam    = interaction.options.getString('home_team');
  const awayTeam    = interaction.options.getString('away_team');
  const matchDate   = interaction.options.getString('match_date');
  const gameweek    = interaction.options.getInteger('gameweek');
  const result = db.addMatch(competition, homeTeam, awayTeam, matchDate, gameweek);
  const match  = db.getMatch(result.lastInsertRowid);
  return interaction.reply({ embeds: [matchEmbed(match, `✅ Match #${match.id} Added`)] });
}

// ── /setresult (admin) ────────────────────────────────────────

async function handleSetResult(interaction) {
  if (!isAdmin(interaction)) return interaction.reply({ embeds: [errorEmbed('No permission.')], ephemeral: true });
  const matchId   = interaction.options.getInteger('match_id');
  const homeScore = interaction.options.getInteger('home_score');
  const awayScore = interaction.options.getInteger('away_score');
  const match = db.getMatch(matchId);
  if (!match) return interaction.reply({ embeds: [errorEmbed(`Match #${matchId} not found.`)], ephemeral: true });

  const count = db.setResult(matchId, homeScore, awayScore);

  // DM users their points
  const predictions = db.getPredictionsForMatch(matchId);
  for (const pred of predictions) {
    try {
      const user = await client.users.fetch(pred.user_id);
      const icon = pred.points === 4 ? '🎯' : pred.points === 2 ? '📏' : pred.points === 1 ? '✅' : '❌';
      await user.send(`${icon} **${match.home_team} ${homeScore}–${awayScore} ${match.away_team}**\nYour prediction: **${pred.home_score}–${pred.away_score}** → **${pred.points} points**`);
    } catch {}
  }

  // Post to announcement channel
  const channel = await getAnnouncementChannel();
  if (channel) {
    const gw = match.gameweek ? ` (GW${match.gameweek})` : '';
    const embed = new EmbedBuilder().setColor(0x57f287)
      .setTitle(`⚽ Result: ${match.home_team} ${homeScore}–${awayScore} ${match.away_team}${gw}`)
      .setDescription(`${count} predictions scored!`)
      .setFooter({ text: '🎯 Exact=4pts · 📏 Close=2pts · ✅ Result=1pt' });
    await channel.send({ embeds: [embed] });

    // Post mini leaderboard for the gameweek if applicable
    if (match.gameweek) {
      const gwRows = db.getGameweekLeaderboard(match.gameweek);
      if (gwRows.length > 0) {
        await channel.send({ embeds: [leaderboardEmbed(gwRows, `GW${match.gameweek} Standings so far`)] });
      }
    }
  }

  const embed = new EmbedBuilder().setColor(0x57f287)
    .setTitle(`✅ Result Set — Match #${matchId}`)
    .setDescription(`**${match.home_team}** ${homeScore} – ${awayScore} **${match.away_team}**`)
    .addFields({ name: 'Points Awarded', value: `Scored ${count} prediction(s)` });
  return interaction.reply({ embeds: [embed] });
}

// ── /lockmatch (admin) ────────────────────────────────────────

async function handleLockMatch(interaction) {
  if (!isAdmin(interaction)) return interaction.reply({ embeds: [errorEmbed('No permission.')], ephemeral: true });
  const matchId = interaction.options.getInteger('match_id');
  const match   = db.getMatch(matchId);
  if (!match) return interaction.reply({ embeds: [errorEmbed(`Match #${matchId} not found.`)], ephemeral: true });
  db.lockMatch(matchId);
  return interaction.reply({ embeds: [successEmbed(`Match #${matchId} (**${match.home_team}** vs **${match.away_team}**) is now locked!`)] });
}

// ── /matchpredictions (admin) ─────────────────────────────────

async function handleMatchPredictions(interaction) {
  if (!isAdmin(interaction)) return interaction.reply({ embeds: [errorEmbed('No permission.')], ephemeral: true });
  const matchId = interaction.options.getInteger('match_id');
  const match   = db.getMatch(matchId);
  if (!match) return interaction.reply({ embeds: [errorEmbed(`Match #${matchId} not found.`)], ephemeral: true });
  const preds = db.getPredictionsForMatch(matchId);
  if (preds.length === 0) return interaction.reply({ embeds: [errorEmbed('No predictions yet.')], ephemeral: true });

  const lines = preds.map(p => {
    const icon = p.points === 4 ? '🎯' : p.points === 2 ? '📏' : p.points === 1 ? '✅' : p.points === 0 ? '❌' : '';
    const pts = p.points !== null ? ` → **${p.points}pts** ${icon}` : '';
    return `**${p.username}**: ${p.home_score}–${p.away_score}${pts}`;
  });

  const result = match.home_score !== null ? `Result: **${match.home_score}–${match.away_score}**` : 'Result: Pending';
  const embed = new EmbedBuilder().setColor(0x5865f2)
    .setTitle(`📋 Predictions — #${matchId} ${match.home_team} vs ${match.away_team}`)
    .setDescription(`${result}\n\n${lines.join('\n')}`)
    .setFooter({ text: `${preds.length} prediction(s)` });
  return interaction.reply({ embeds: [embed], ephemeral: true });
}

// ── /setchannel (admin) ───────────────────────────────────────

async function handleSetChannel(interaction) {
  if (!isAdmin(interaction)) return interaction.reply({ embeds: [errorEmbed('No permission.')], ephemeral: true });
  const channel = interaction.options.getChannel('channel');
  db.setSetting('announcement_channel', channel.id);
  return interaction.reply({ embeds: [successEmbed(`Announcements will be posted to ${channel}`)] });
}

// ── /sync (admin) ─────────────────────────────────────────────

async function handleSync(interaction) {
  if (!isAdmin(interaction)) return interaction.reply({ embeds: [errorEmbed('No permission.')], ephemeral: true });
  await interaction.deferReply();
  try {
    const results = await api.syncAll();
    const lines = Object.entries(results).map(([comp, r]) =>
      r.error ? `❌ **${comp}**: ${r.error}` : `✅ **${comp}**: ${r.fixtures} fixtures, ${r.scored} scored`
    );
    const embed = new EmbedBuilder().setColor(0x57f287).setTitle('🔄 Sync Complete').setDescription(lines.join('\n'));
    return interaction.editReply({ embeds: [embed] });
  } catch (err) {
    return interaction.editReply({ embeds: [errorEmbed(`Sync failed: ${err.message}`)] });
  }
}

// ── Auto-lock matches at kickoff ──────────────────────────────

async function autoLockMatches() {
  try {
    const toLock = db.getUnlockedPastMatches();
    for (const match of toLock) {
      db.lockMatch(match.id);
      console.log(`🔒 Auto-locked match #${match.id}: ${match.home_team} vs ${match.away_team}`);
      const channel = await getAnnouncementChannel();
      if (channel) {
        await channel.send({ embeds: [successEmbed(`🔒 Predictions locked for **${match.home_team}** vs **${match.away_team}**! Good luck everyone!`)] });
      }
    }
  } catch (err) {
    console.error('Auto-lock error:', err.message);
  }
}

// ── Auto-sync ─────────────────────────────────────────────────

async function autoSync() {
  try {
    console.log('🔄 Auto-syncing...');
    const results = await api.syncAll();
    for (const [comp, r] of Object.entries(results)) {
      if (r.error) console.error(`  ❌ ${comp}: ${r.error}`);
      else console.log(`  ✅ ${comp}: ${r.fixtures} fixtures, ${r.scored} scored`);
    }
  } catch (err) {
    console.error('Auto-sync error:', err.message);
  }
}

client.login(process.env.DISCORD_TOKEN);
