require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle } = require('discord.js');
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
    setInterval(autoLockMatches, 60 * 1000);
  }, 5000);
});

function isAdmin(interaction) {
  return interaction.member?.permissions.has('ManageGuild');
}

async function getAnnouncementChannel() {
  const channelId = await db.getSetting('announcement_channel');
  if (!channelId) return null;
  try { return await client.channels.fetch(channelId); } catch { return null; }
}

// ── In-memory store for predictgw sessions ────────────────────
const gwSessions = new Map();

// ── Command router ────────────────────────────────────────────

client.on('interactionCreate', async (interaction) => {
  if (interaction.isStringSelectMenu() && interaction.customId === 'predict_match') {
    return await handlePredictMatchSelected(interaction);
  }
  if (interaction.isModalSubmit() && interaction.customId.startsWith('predict_score_')) {
    return await handlePredictScoreSubmit(interaction);
  }
  if (interaction.isModalSubmit() && interaction.customId.startsWith('predictgw_page')) {
    return await handlePredictGWModalSubmit(interaction);
  }
  // Button to open next predictgw modal page
  if (interaction.isButton() && interaction.customId.startsWith('predictgw_next_')) {
    return await handlePredictGWNextPage(interaction);
  }
  if (!interaction.isChatInputCommand()) return;
  try {
    switch (interaction.commandName) {
      case 'predict':          return await handlePredict(interaction);
      case 'predictgw':        return await handlePredictGW(interaction);
      case 'matches':          return await handleMatches(interaction);
      case 'fixtures':         return await handleFixtures(interaction);
      case 'results':          return await handleResults(interaction);
      case 'mypredictions':    return await handleMyPredictions(interaction);
      case 'leaderboard':      return await handleLeaderboard(interaction);
      case 'profile':          return await handleProfile(interaction);
      case 'scoring':          return await handleScoring(interaction);
      case 'h2h':              return await handleH2H(interaction);
      case 'addmatch':         return await handleAddMatch(interaction);
      case 'setresult':        return await handleSetResult(interaction);
      case 'lockmatch':        return await handleLockMatch(interaction);
      case 'matchpredictions': return await handleMatchPredictions(interaction);
      case 'setchannel':       return await handleSetChannel(interaction);
      case 'sync':             return await handleSync(interaction);
      case 'admincheck':       return await handleAdminCheck(interaction);
      case 'audit':            return await handleAudit(interaction);
      case 'remindmissing':    return await handleRemindMissing(interaction);
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
  const competition = interaction.options.getString('competition');
  const allMatches = await db.getUpcomingMatches(competition);
  const matches = allMatches.filter(m => !m.locked && m.home_score === null);

  if (matches.length === 0) {
    return interaction.reply({ embeds: [errorEmbed('No upcoming matches to predict! Check back later.')], ephemeral: true });
  }

  const options = await Promise.all(matches.slice(0, 25).map(async m => {
    const gw = m.gameweek ? ` GW${m.gameweek}` : '';
    const existing = await db.getUserPrediction(interaction.user.id, m.id);
    const label = `${m.home_team} vs ${m.away_team}`;
    const desc = `${m.match_date}${gw}${existing ? ` · Your pick: ${existing.home_score}-${existing.away_score}` : ''}`;
    return {
      label: label.length > 100 ? label.substring(0, 97) + '...' : label,
      description: desc.length > 100 ? desc.substring(0, 97) + '...' : desc,
      value: String(m.id),
      emoji: existing ? '✏️' : '⚽',
    };
  }));

  const menu = new StringSelectMenuBuilder()
    .setCustomId('predict_match')
    .setPlaceholder('Select a match to predict...')
    .addOptions(options);

  const row = new ActionRowBuilder().addComponents(menu);

  return interaction.reply({
    embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle('⚽ Select a Match to Predict').setDescription('Choose a match from the dropdown below. You can update your prediction any time before kickoff.')],
    components: [row],
    ephemeral: true,
  });
}

// ── Predict: match selected from dropdown ─────────────────────

async function handlePredictMatchSelected(interaction) {
  const matchId = parseInt(interaction.values[0]);
  const match = await db.getMatch(matchId);

  if (!match || match.locked || match.home_score !== null) {
    return interaction.reply({ embeds: [errorEmbed('This match is no longer available.')], ephemeral: true });
  }

  const existing = await db.getUserPrediction(interaction.user.id, matchId);

  const modal = new ModalBuilder()
    .setCustomId(`predict_score_${matchId}`)
    .setTitle(`${match.home_team} vs ${match.away_team}`);

  const homeInput = new TextInputBuilder()
    .setCustomId('home_score')
    .setLabel(`${match.home_team} (Home) Score`)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g. 2')
    .setMinLength(1)
    .setMaxLength(2)
    .setRequired(true);

  if (existing) homeInput.setValue(String(existing.home_score));

  const awayInput = new TextInputBuilder()
    .setCustomId('away_score')
    .setLabel(`${match.away_team} (Away) Score`)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g. 1')
    .setMinLength(1)
    .setMaxLength(2)
    .setRequired(true);

  if (existing) awayInput.setValue(String(existing.away_score));

  modal.addComponents(
    new ActionRowBuilder().addComponents(homeInput),
    new ActionRowBuilder().addComponents(awayInput),
  );

  return interaction.showModal(modal);
}

// ── Predict: score submitted via modal ────────────────────────

async function handlePredictScoreSubmit(interaction) {
  const matchId   = parseInt(interaction.customId.replace('predict_score_', ''));
  const homeScore = parseInt(interaction.fields.getTextInputValue('home_score'));
  const awayScore = parseInt(interaction.fields.getTextInputValue('away_score'));

  if (isNaN(homeScore) || isNaN(awayScore) || homeScore < 0 || awayScore < 0) {
    return interaction.reply({ embeds: [errorEmbed('Please enter valid scores (numbers only).')], ephemeral: true });
  }

  const match = await db.getMatch(matchId);
  if (!match || match.locked || match.home_score !== null) {
    return interaction.reply({ embeds: [errorEmbed('This match is no longer available.')], ephemeral: true });
  }

  await db.upsertPredictionWithAudit(interaction.user.id, interaction.user.username, matchId, homeScore, awayScore);

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

// ── /predictgw ────────────────────────────────────────────────

async function handlePredictGW(interaction) {
  let matches = [];
  let groupLabel = '';

  const gwRows = await db.query(
    `SELECT DISTINCT competition, gameweek FROM matches
     WHERE gameweek IS NOT NULL AND home_score IS NULL AND locked = 0
     ORDER BY gameweek ASC LIMIT 1`
  );

  if (gwRows.length > 0) {
    const { competition, gameweek } = gwRows[0];
    const allMatches = await db.getMatchesByGameweek(gameweek, competition);
    matches = allMatches.filter(m => !m.locked && m.home_score === null);
    groupLabel = `GW${gameweek} · ${competition}`;
  }

  if (matches.length === 0) {
    const dateRows = await db.query(
      `SELECT DISTINCT match_date FROM matches
       WHERE gameweek IS NULL AND home_score IS NULL AND locked = 0
       ORDER BY match_date ASC LIMIT 1`
    );
    if (dateRows.length > 0) {
      const nextDate = dateRows[0].match_date;
      const allMatches = await db.getMatchesByDate(nextDate);
      matches = allMatches.filter(m => !m.locked && m.home_score === null);
      groupLabel = nextDate;
    }
  }

  if (matches.length === 0) {
    return interaction.reply({ embeds: [errorEmbed('No open fixtures found. Check back later or use `/sync`.')], ephemeral: true });
  }

  // Pre-fetch existing predictions for page 0 before showModal
  const existingPreds = {};
  for (const m of matches.slice(0, 5)) {
    const pred = await db.getUserPrediction(interaction.user.id, m.id);
    if (pred) existingPreds[m.id] = pred;
  }

  gwSessions.set(interaction.user.id, { matches, saved: [], failed: [], groupLabel, existingPreds });

  // showModal called immediately after all awaits — still within 3s window
  return interaction.showModal(buildGWModal(interaction.user.id, 0));
}

// ── predictgw: build modal (pure sync, no DB calls) ──────────

function buildGWModal(userId, page) {
  const session = gwSessions.get(userId);
  const { matches, groupLabel, existingPreds } = session;
  const start = page * 5;
  const pageMatches = matches.slice(start, start + 5);
  const totalPages = Math.ceil(matches.length / 5);

  const title = `${groupLabel || 'Predictions'} (${page + 1}/${totalPages})`;
  const modal = new ModalBuilder()
    .setCustomId(`predictgw_page${page}`)
    .setTitle(title.length > 45 ? title.substring(0, 42) + '...' : title);

  for (const m of pageMatches) {
    const existing = existingPreds[m.id];
    const label = `${m.home_team} vs ${m.away_team}`;
    const input = new TextInputBuilder()
      .setCustomId(`match_${m.id}`)
      .setLabel(label.length > 45 ? label.substring(0, 42) + '...' : label)
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('e.g. 2-1')
      .setMinLength(3)
      .setMaxLength(7)
      .setRequired(true);

    if (existing) input.setValue(`${existing.home_score}-${existing.away_score}`);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
  }

  return modal;
}

// ── predictgw: modal page submitted ──────────────────────────
// Save this page's data, then either show "Continue" button or summary

async function handlePredictGWModalSubmit(interaction) {
  const page = parseInt(interaction.customId.replace('predictgw_page', ''));
  const session = gwSessions.get(interaction.user.id);

  if (!session) {
    return interaction.reply({ embeds: [errorEmbed('Session expired. Please run `/predictgw` again.')], ephemeral: true });
  }

  const { matches } = session;
  const start = page * 5;
  const pageMatches = matches.slice(start, start + 5);

  // Save predictions from this page
  for (const m of pageMatches) {
    const raw = interaction.fields.getTextInputValue(`match_${m.id}`).trim();
    if (!raw) continue;

    const parts = raw.split('-');
    if (parts.length !== 2) {
      session.failed.push(`${m.home_team} vs ${m.away_team} (invalid format: "${raw}")`);
      continue;
    }
    const homeScore = parseInt(parts[0]);
    const awayScore = parseInt(parts[1]);
    if (isNaN(homeScore) || isNaN(awayScore) || homeScore < 0 || awayScore < 0) {
      session.failed.push(`${m.home_team} vs ${m.away_team} (invalid scores: "${raw}")`);
      continue;
    }

    const fresh = await db.getMatch(m.id);
    if (!fresh || fresh.locked || fresh.home_score !== null) {
      session.failed.push(`${m.home_team} vs ${m.away_team} (match now locked)`);
      continue;
    }

    await db.upsertPredictionWithAudit(interaction.user.id, interaction.user.username, m.id, homeScore, awayScore);
    session.saved.push(`${m.home_team} ${homeScore}–${awayScore} ${m.away_team}`);
  }

  const nextPage = page + 1;
  const hasMore = nextPage * 5 < matches.length;

  if (hasMore) {
    // Pre-fetch existing preds for next page (DB calls BEFORE we reply)
    const nextPageMatches = matches.slice(nextPage * 5, nextPage * 5 + 5);
    for (const m of nextPageMatches) {
      const pred = await db.getUserPrediction(interaction.user.id, m.id);
      if (pred) session.existingPreds[m.id] = pred;
    }

    // Reply with a "Continue" button — clicking it gives a fresh interaction
    // so showModal will work on that button click without timeout issues
    const continueBtn = new ButtonBuilder()
      .setCustomId(`predictgw_next_${nextPage}`)
      .setLabel(`Continue to matches ${nextPage * 5 + 1}–${Math.min(nextPage * 5 + 5, matches.length)} →`)
      .setStyle(ButtonStyle.Primary);

    const savedSoFar = session.saved.length > 0
      ? session.saved.map(s => `✅ ${s}`).join('\n')
      : 'None yet';

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`⚽ Page ${page + 1} saved! Click to continue...`)
          .addFields({ name: 'Saved so far', value: savedSoFar })
      ],
      components: [new ActionRowBuilder().addComponents(continueBtn)],
      ephemeral: true,
    });
  }

  // All done — show summary
  gwSessions.delete(interaction.user.id);
  return interaction.reply({ embeds: [buildSummaryEmbed(session)], ephemeral: true });
}

// ── predictgw: "Continue" button clicked ─────────────────────
// Fresh button interaction — showModal works here with no timeout issues

async function handlePredictGWNextPage(interaction) {
  const nextPage = parseInt(interaction.customId.replace('predictgw_next_', ''));
  const session = gwSessions.get(interaction.user.id);

  if (!session) {
    return interaction.reply({ embeds: [errorEmbed('Session expired. Please run `/predictgw` again.')], ephemeral: true });
  }

  // showModal is the FIRST thing called on this fresh button interaction
  return interaction.showModal(buildGWModal(interaction.user.id, nextPage));
}

// ── predictgw: build summary embed ───────────────────────────

function buildSummaryEmbed(session) {
  const savedLines = session.saved.length > 0
    ? session.saved.map(s => `✅ ${s}`).join('\n')
    : 'None';
  const embed = new EmbedBuilder()
    .setColor(session.saved.length > 0 ? 0x57f287 : 0xed4245)
    .setTitle('⚽ Gameweek Predictions Saved!')
    .addFields({ name: `✅ Saved (${session.saved.length})`, value: savedLines });
  if (session.failed.length > 0) {
    embed.addFields({ name: `❌ Failed (${session.failed.length})`, value: session.failed.map(s => `❌ ${s}`).join('\n') });
  }
  embed.setFooter({ text: 'Use /predictgw again to update any predictions before kickoff.' });
  return embed;
}

// ── /matches ──────────────────────────────────────────────────

async function handleMatches(interaction) {
  const competition = interaction.options.getString('competition');
  const gameweek    = interaction.options.getInteger('gameweek');

  let matches, title;
  if (gameweek && competition !== 'World Cup') {
    matches = await db.getMatchesByGameweek(gameweek, competition || 'Premier League');
    title = `GW${gameweek} Matches`;
  } else {
    matches = await db.getUpcomingMatches(competition);
    title = competition ? `Upcoming ${competition} Matches` : 'Upcoming Matches';
  }

  return interaction.reply({ embeds: [matchListEmbed(matches, title)] });
}

// ── /fixtures ─────────────────────────────────────────────────

async function handleFixtures(interaction) {
  await interaction.deferReply();
  const when = interaction.options.getString('when') || 'all';
  const competition = interaction.options.getString('competition');

  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/London' }));
  const todayStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  let matches, title;
  if (when === 'today') {
    matches = await db.getMatchesByDate(todayStr);
    if (competition) matches = matches.filter(m => m.competition === competition);
    title = `📅 Today's Fixtures (${todayStr})`;
  } else if (when === 'tomorrow') {
    matches = await db.getMatchesByDate(tomorrowStr);
    if (competition) matches = matches.filter(m => m.competition === competition);
    title = `📅 Tomorrow's Fixtures (${tomorrowStr})`;
  } else {
    matches = await api.getUpcoming(competition, 10);
    title = competition ? `📅 Upcoming ${competition} Fixtures` : '📅 Upcoming Fixtures';
  }

  if (matches.length === 0) {
    return interaction.editReply({ embeds: [errorEmbed('No fixtures found. Try `/sync` to fetch the latest.')] });
  }
  const lines = matches.map(m => {
    const gw = m.gameweek ? ` · GW${m.gameweek}` : '';
    const lock = m.locked ? ' 🔒' : '';
    return `**#${m.id}** ${m.home_team} vs ${m.away_team}${lock}\n📅 ${m.match_date}${gw} · ${m.competition}`;
  });
  const embed = new EmbedBuilder().setColor(0x3d195b)
    .setTitle(title)
    .setDescription(lines.join('\n\n'))
    .setFooter({ text: 'Use /predict to submit your prediction' });
  return interaction.editReply({ embeds: [embed] });
}

// ── /results ──────────────────────────────────────────────────

async function handleResults(interaction) {
  await interaction.deferReply();
  const competition = interaction.options.getString('competition');
  const matches = await api.getRecentResults(competition, 10);
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
  const rows = await db.query(
    `SELECT m.id, m.competition, m.home_team, m.away_team, m.match_date, m.locked, m.gameweek,
            p.home_score as pred_home, p.away_score as pred_away, p.points
     FROM predictions p JOIN matches m ON p.match_id = m.id
     WHERE p.user_id = $1 ORDER BY m.match_date DESC LIMIT 20`,
    [interaction.user.id]
  );

  if (rows.length === 0) {
    return interaction.reply({ embeds: [errorEmbed('No predictions yet! Use `/matches` to see upcoming games.')], ephemeral: true });
  }

  const lines = rows.map(r => {
    const lock = r.locked ? ' 🔒' : '';
    const gw = r.gameweek ? ` · GW${r.gameweek}` : '';
    let pts = '';
    if (r.points !== null) {
      const icon = r.points >= 7 ? '💥' : r.points >= 5 ? '🎯' : r.points >= 3 ? '✅' : r.points > 0 ? '📏' : '❌';
      pts = ` → **${r.points}pts** ${icon}`;
    }
    return `**#${r.id}** ${r.home_team} vs ${r.away_team}${lock}\nPick: **${r.pred_home}–${r.pred_away}**${pts} · ${r.match_date}${gw}`;
  });

  const embed = new EmbedBuilder().setColor(0x5865f2)
    .setTitle(`📋 ${interaction.user.username}'s Predictions`)
    .setDescription(lines.join('\n\n'))
    .setFooter({ text: '💥 Exact=10pts · ✅ Result=3pts · 🎯 Home/Away=2pts' });

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

// ── /leaderboard ──────────────────────────────────────────────

async function handleLeaderboard(interaction) {
  const competition = interaction.options.getString('competition');
  const gameweek    = interaction.options.getInteger('gameweek');
  const date        = interaction.options.getString('date');

  let rows, title;
  if (gameweek) {
    rows = await db.getGameweekLeaderboard(gameweek, competition || 'Premier League');
    title = `GW${gameweek} Leaderboard`;
  } else if (date) {
    rows = await db.getDayLeaderboard(date);
    title = `${date} Leaderboard`;
  } else {
    const filter = competition === 'overall' ? null : competition;
    rows = await db.getLeaderboard(filter);
    title = competition && competition !== 'overall' ? `${competition} Leaderboard` : 'Overall Leaderboard';
  }

  return interaction.reply({ embeds: [leaderboardEmbed(rows, title)] });
}

// ── /profile ──────────────────────────────────────────────────

async function handleProfile(interaction) {
  const target = interaction.options.getUser('user') || interaction.user;
  const stats = await db.getUserProfile(target.id);

  const upcoming = await db.query(
    `SELECT m.id, m.home_team, m.away_team, m.match_date, m.gameweek, m.competition,
            p.home_score as pred_home, p.away_score as pred_away
     FROM predictions p
     JOIN matches m ON p.match_id = m.id
     WHERE p.user_id = $1 AND m.home_score IS NULL
     ORDER BY m.match_date ASC
     LIMIT 10`,
    [target.id]
  );

  const upcomingLines = upcoming.length > 0
    ? upcoming.map(r => {
        const gw = r.gameweek ? ` GW${r.gameweek}` : '';
        return `⚽ **${r.home_team} vs ${r.away_team}**${gw}\n📅 ${r.match_date} · Pick: **${r.pred_home}–${r.pred_away}**`;
      }).join('\n\n')
    : 'No upcoming predictions yet.';

  if (!stats) {
    const embed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle(`📊 ${target.username}'s Profile`)
      .setDescription('No scored predictions yet!')
      .addFields({ name: '📋 Upcoming Predictions', value: upcomingLines });
    return interaction.reply({ embeds: [embed] });
  }

  const streak = stats.current_streak >= 3 ? ` 🔥 On a ${stats.current_streak} streak!` : '';
  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle(`📊 ${target.username}'s Profile${streak}`)
    .addFields(
      { name: '🏆 Total Points', value: String(stats.total_points), inline: true },
      { name: '📋 Predictions', value: String(stats.predictions_scored), inline: true },
      { name: '\u200b', value: '\u200b', inline: true },
      { name: '🎯 Exact Scores', value: String(stats.exact_scores), inline: true },
      { name: '📏 Close Scores', value: String(stats.close_scores || 0), inline: true },
      { name: '✅ Correct Results', value: String(stats.correct_results), inline: true },
      { name: '🔥 Current Streak', value: String(stats.current_streak), inline: true },
      { name: '⭐ Best Streak', value: String(stats.best_streak), inline: true },
      { name: '\u200b', value: '\u200b', inline: true },
      { name: '📋 Upcoming Predictions', value: upcomingLines },
    );

  return interaction.reply({ embeds: [embed] });
}

// ── /scoring ──────────────────────────────────────────────────

async function handleScoring(interaction) {
  const embed = new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle('📊 How Scoring Works')
    .setDescription([
      '**For each team\'s goals:**',
      '🎯 Exact goals predicted → **+2 pts**',
      '📏 1 goal away → **+1 pt**',
      '',
      '**Bonuses:**',
      '✅ Correct result (W/D/L) → **+3 pts**',
      '💥 Exact score (both teams) → **+3 bonus pts**',
      '',
      '**Max possible: 10 pts** (2+2+3+3)',
      '',
      '**Examples:**',
      '`Predicted 2-1, Actual 2-1` → 2+2+3+3 = **10pts** 💥',
      '`Predicted 2-1, Actual 2-0` → 2+1+3 = **6pts**',
      '`Predicted 2-1, Actual 1-0` → 1+1+3 = **5pts**',
      '`Predicted 2-1, Actual 0-2` → 0+1+0 = **1pt**',
      '`Predicted 2-1, Actual 0-3` → 0+0+0 = **0pts**',
    ].join('\n'));
  return interaction.reply({ embeds: [embed] });
}

// ── /h2h ──────────────────────────────────────────────────────

async function handleH2H(interaction) {
  const user1 = interaction.options.getUser('user1');
  const user2 = interaction.options.getUser('user2');
  const h2h = await db.getH2H(user1.id, user2.id);
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
  const result = await db.addMatch(competition, homeTeam, awayTeam, matchDate, gameweek);
  const match  = await db.getMatch(result.lastInsertRowid);
  return interaction.reply({ embeds: [matchEmbed(match, `✅ Match #${match.id} Added`)] });
}

// ── /setresult (admin) ────────────────────────────────────────

async function handleSetResult(interaction) {
  if (!isAdmin(interaction)) return interaction.reply({ embeds: [errorEmbed('No permission.')], ephemeral: true });
  const matchId   = interaction.options.getInteger('match_id');
  const homeScore = interaction.options.getInteger('home_score');
  const awayScore = interaction.options.getInteger('away_score');
  const match = await db.getMatch(matchId);
  if (!match) return interaction.reply({ embeds: [errorEmbed(`Match #${matchId} not found.`)], ephemeral: true });

  const count = await db.setResult(matchId, homeScore, awayScore);
  const predictions = await db.getPredictionsForMatch(matchId);

  for (const pred of predictions) {
    try {
      const user = await client.users.fetch(pred.user_id);
      const icon = pred.points >= 7 ? '💥' : pred.points >= 5 ? '🎯' : pred.points >= 3 ? '✅' : pred.points > 0 ? '📏' : '❌';
      await user.send(`${icon} **${match.home_team} ${homeScore}–${awayScore} ${match.away_team}**\nYour prediction: **${pred.home_score}–${pred.away_score}** → **${pred.points} points**`);
    } catch {}
  }

  const channel = await getAnnouncementChannel();
  if (channel) {
    const gw = match.gameweek ? ` (GW${match.gameweek})` : '';
    const embed = new EmbedBuilder().setColor(0x57f287)
      .setTitle(`⚽ Result: ${match.home_team} ${homeScore}–${awayScore} ${match.away_team}${gw}`)
      .setDescription(`${count} predictions scored!`)
      .setFooter({ text: '💥 Exact=10pts · ✅ Result=3pts · 🎯 Home/Away=2pts' });
    await channel.send({ embeds: [embed] });

    if (match.gameweek) {
      const gwRows = await db.getGameweekLeaderboard(match.gameweek);
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
  const match   = await db.getMatch(matchId);
  if (!match) return interaction.reply({ embeds: [errorEmbed(`Match #${matchId} not found.`)], ephemeral: true });
  await db.lockMatch(matchId);
  return interaction.reply({ embeds: [successEmbed(`Match #${matchId} (**${match.home_team}** vs **${match.away_team}**) is now locked!`)] });
}

// ── /matchpredictions (admin) ─────────────────────────────────

async function handleMatchPredictions(interaction) {
  if (!isAdmin(interaction)) return interaction.reply({ embeds: [errorEmbed('No permission.')], ephemeral: true });
  const matchId = interaction.options.getInteger('match_id');
  const match   = await db.getMatch(matchId);
  if (!match) return interaction.reply({ embeds: [errorEmbed(`Match #${matchId} not found.`)], ephemeral: true });
  const preds = await db.getPredictionsForMatch(matchId);
  if (preds.length === 0) return interaction.reply({ embeds: [errorEmbed('No predictions yet.')], ephemeral: true });

  const lines = preds.map(p => {
    const icon = p.points >= 7 ? '💥' : p.points >= 5 ? '🎯' : p.points >= 3 ? '✅' : p.points === 0 ? '❌' : '';
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
  await db.setSetting('announcement_channel', channel.id);
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

// ── /admincheck (admin) ───────────────────────────────────────

async function handleAdminCheck(interaction) {
  if (!isAdmin(interaction)) return interaction.reply({ embeds: [errorEmbed('No permission.')], ephemeral: true });
  await interaction.deferReply({ ephemeral: true });

  let dbConnected = true;
  let upcomingCount = 0, lockedCount = 0, predictionsCount = 0, usersCount = 0;

  try {
    const [upcoming, locked, predictions, users] = await Promise.all([
      db.queryOne(`SELECT COUNT(*) as c FROM matches WHERE home_score IS NULL AND locked = 0`),
      db.queryOne(`SELECT COUNT(*) as c FROM matches WHERE locked = 1`),
      db.queryOne(`SELECT COUNT(*) as c FROM predictions`),
      db.queryOne(`SELECT COUNT(DISTINCT user_id) as c FROM predictions`),
    ]);
    upcomingCount     = parseInt(upcoming?.c  ?? 0);
    lockedCount       = parseInt(locked?.c    ?? 0);
    predictionsCount  = parseInt(predictions?.c ?? 0);
    usersCount        = parseInt(users?.c     ?? 0);
  } catch {
    dbConnected = false;
  }

  const lastSync = await db.getSetting('last_sync').catch(() => null);

  const embed = new EmbedBuilder()
    .setColor(dbConnected ? 0x57f287 : 0xed4245)
    .setTitle('🛠️ Admin System Check')
    .addFields(
      { name: '🗄️ Database',          value: dbConnected ? '✅ Connected' : '❌ Error',  inline: true },
      { name: '📅 Upcoming Matches',   value: String(upcomingCount),                      inline: true },
      { name: '🔒 Locked Matches',     value: String(lockedCount),                        inline: true },
      { name: '📋 Total Predictions',  value: String(predictionsCount),                   inline: true },
      { name: '👥 Users',              value: String(usersCount),                         inline: true },
      { name: '🔄 Last Sync',          value: lastSync ?? 'Never',                        inline: true },
    )
    .setTimestamp();

  return interaction.editReply({ embeds: [embed] });
}

// ── /audit (admin) ────────────────────────────────────────────

async function handleAudit(interaction) {
  if (!isAdmin(interaction)) return interaction.reply({ embeds: [errorEmbed('No permission.')], ephemeral: true });
  await interaction.deferReply({ ephemeral: true });

  const targetUser = interaction.options.getUser('user');
  const matchId    = interaction.options.getInteger('match_id');

  const rows = await db.getRecentAuditLog(targetUser?.id ?? null, matchId ?? null);

  if (rows.length === 0) {
    return interaction.editReply({ embeds: [errorEmbed('No audit log entries found.')] });
  }

  const lines = rows.map(r => {
    const oldScore = r.old_home_score !== null ? `${r.old_home_score}–${r.old_away_score}` : 'new';
    const newScore = `${r.new_home_score}–${r.new_away_score}`;
    const arrow = r.old_home_score !== null ? `${oldScore} → ${newScore}` : `➕ ${newScore}`;
    return `**${r.username}** · ${r.home_team} vs ${r.away_team}\n${arrow} · <t:${Math.floor(new Date(r.changed_at).getTime() / 1000)}:R>`;
  });

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🔍 Prediction Audit Log')
    .setDescription(lines.join('\n\n'))
    .setFooter({ text: `Showing last ${rows.length} entries` });

  return interaction.editReply({ embeds: [embed] });
}

// ── /remindmissing (admin) ────────────────────────────────────

async function handleRemindMissing(interaction) {
  if (!isAdmin(interaction)) return interaction.reply({ embeds: [errorEmbed('No permission.')], ephemeral: true });
  await interaction.deferReply({ ephemeral: true });

  const { matches, label } = await db.getCurrentGWMatches();

  if (matches.length === 0) {
    return interaction.editReply({ embeds: [errorEmbed('No open fixtures found.')] });
  }

  const matchIds = matches.map(m => m.id);

  // All users who have made at least one prediction ever
  const allUsers = await db.query(
    `SELECT DISTINCT user_id, username FROM predictions ORDER BY username ASC`
  );

  if (allUsers.length === 0) {
    return interaction.editReply({ embeds: [errorEmbed('No users have made any predictions yet.')] });
  }

  // For each user, count how many of the current GW matches they've predicted
  const missing = [];
  for (const user of allUsers) {
    const rows = await db.query(
      `SELECT COUNT(*) as c FROM predictions WHERE user_id = $1 AND match_id = ANY($2::int[])`,
      [user.user_id, matchIds]
    );
    const predicted = parseInt(rows[0]?.c ?? 0);
    const remaining = matchIds.length - predicted;
    if (remaining > 0) {
      missing.push({ username: user.username, remaining });
    }
  }

  if (missing.length === 0) {
    return interaction.editReply({ embeds: [successEmbed(`✅ All users have predicted every match in **${label}**!`)] });
  }

  const lines = missing.map(u => `**${u.username}** — ${u.remaining} prediction${u.remaining > 1 ? 's' : ''} missing`);

  const embed = new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle(`⚠️ Missing Predictions — ${label}`)
    .setDescription(lines.join('\n'))
    .setFooter({ text: `${missing.length} user(s) incomplete · ${matchIds.length} matches in this set` });

  return interaction.editReply({ embeds: [embed] });
}

// ── Auto-lock matches at kickoff ──────────────────────────────

async function autoLockMatches() {
  try {
    const toLock = await db.getUnlockedPastMatches();
    for (const match of toLock) {
      await db.lockMatch(match.id);
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
    await db.setSetting('last_sync', new Date().toUTCString());
    for (const [comp, r] of Object.entries(results)) {
      if (r.error) {
        console.error(`  ❌ ${comp}: ${r.error}`);
        continue;
      }
      console.log(`  ✅ ${comp}: ${r.fixtures} fixtures, ${r.scored} scored`);
      if (r.scoredMatches && r.scoredMatches.length > 0) {
        const channel = await getAnnouncementChannel();

        for (const { match, homeScore, awayScore, predictionsCount } of r.scoredMatches) {
          const gw = match.gameweek ? ` (GW${match.gameweek})` : '';

          if (channel) {
            const resultEmbed = new EmbedBuilder()
              .setColor(0x57f287)
              .setTitle(`⚽ Result: ${match.home_team} ${homeScore}–${awayScore} ${match.away_team}${gw}`)
              .setDescription(`Points awarded to ${predictionsCount} prediction(s)!`)
              .setFooter({ text: '💥 Exact=10pts · ✅ Result=3pts · Use /leaderboard to check standings' });
            await channel.send({ embeds: [resultEmbed] });

            if (match.gameweek) {
              const gwRows = await db.getGameweekLeaderboard(match.gameweek);
              if (gwRows.length > 0) {
                await channel.send({ embeds: [leaderboardEmbed(gwRows, `GW${match.gameweek} Standings`)] });
              }
            }
          }

          const predictions = await db.getPredictionsForMatch(match.id);
          for (const pred of predictions) {
            try {
              const user = await client.users.fetch(pred.user_id);
              const icon = pred.points >= 7 ? '💥' : pred.points >= 3 ? '✅' : pred.points > 0 ? '📏' : '❌';
              await user.send(`${icon} **${match.home_team} ${homeScore}–${awayScore} ${match.away_team}**\nYour prediction: **${pred.home_score}–${pred.away_score}** → **${pred.points} points**`);
            } catch {}
          }
        }
      }
    }
  } catch (err) {
    console.error('Auto-sync error:', err.message);
  }
}

client.login(process.env.DISCORD_TOKEN);
