const { EmbedBuilder } = require('discord.js');

const COLOURS = {
  'Premier League': 0x3d195b,
  'World Cup': 0xc8aa5a,
  success: 0x57f287,
  error: 0xed4245,
  info: 0x5865f2,
  leaderboard: 0xfee75c,
  profile: 0x9b59b6,
};

const COMP_EMOJI = { 'Premier League': '🦁', 'World Cup': '🌍' };

function matchEmbed(match, title = null) {
  const emoji = COMP_EMOJI[match.competition] || '⚽';
  const colour = COLOURS[match.competition] || COLOURS.info;
  const locked = match.locked ? ' 🔒' : '';
  const result = match.home_score !== null ? `**${match.home_score} – ${match.away_score}**` : 'Pending';
  const gw = match.gameweek ? ` · GW${match.gameweek}` : '';
  return new EmbedBuilder()
    .setColor(colour)
    .setTitle(title || `${emoji} Match #${match.id}${locked}`)
    .addFields(
      { name: 'Competition', value: `${match.competition}${gw}`, inline: true },
      { name: 'Date', value: match.match_date, inline: true },
      { name: '\u200b', value: '\u200b', inline: true },
      { name: '🏠 Home', value: match.home_team, inline: true },
      { name: '✈️ Away', value: match.away_team, inline: true },
      { name: '📊 Result', value: result, inline: true },
    );
}

function matchListEmbed(matches, title = 'Upcoming Matches') {
  const embed = new EmbedBuilder()
    .setColor(COLOURS.info)
    .setTitle(`⚽ ${title}`)
    .setFooter({ text: 'Use /predict <match_id> to submit your prediction' });

  if (matches.length === 0) {
    embed.setDescription('No upcoming matches found!');
    return embed;
  }

  const lines = matches.map(m => {
    const lock = m.locked ? ' 🔒' : '';
    const gw = m.gameweek ? ` · GW${m.gameweek}` : '';
    return `**#${m.id}** ${m.home_team} vs ${m.away_team}${lock}\n📅 ${m.match_date}${gw} · ${m.competition}`;
  });

  embed.setDescription(lines.join('\n\n'));
  return embed;
}

function leaderboardEmbed(rows, title = 'Overall Leaderboard') {
  const embed = new EmbedBuilder()
    .setColor(COLOURS.leaderboard)
    .setTitle(`🏆 ${title}`)
    .setFooter({ text: '🎯 Exact=10pts · ✅ Result=3pts · 🎯 Home/Away=2pts' });

  if (rows.length === 0) {
    embed.setDescription('No scores yet!');
    return embed;
  }

  const medals = ['🥇', '🥈', '🥉'];
  const lines = rows.map((r, i) => {
    const pos = medals[i] || `**${i + 1}.**`;
    const streak = r.current_streak >= 3 ? ` 🔥${r.current_streak}` : '';
    return `${pos} **${r.username}** — ${r.total_points}pts${streak}\n*(🎯${r.exact_scores} 📏${r.close_scores || 0} ✅${r.correct_results})*`;
  });

  embed.setDescription(lines.join('\n'));
  return embed;
}

function profileEmbed(user, stats) {
  const streak = stats.current_streak >= 3 ? ` 🔥 On a ${stats.current_streak} streak!` : '';
  return new EmbedBuilder()
    .setColor(COLOURS.profile)
    .setTitle(`📊 ${user.username}'s Profile${streak}`)
    .addFields(
      { name: '🏆 Total Points', value: String(stats.total_points), inline: true },
      { name: '📋 Predictions', value: String(stats.predictions_scored), inline: true },
      { name: '\u200b', value: '\u200b', inline: true },
      { name: '🎯 Exact Scores', value: String(stats.exact_scores), inline: true },
      { name: '📏 Close Scores', value: String(stats.close_scores || 0), inline: true },
      { name: '✅ Correct Results', value: String(stats.correct_results), inline: true },
      { name: '🔥 Current Streak', value: String(stats.current_streak), inline: true },
      { name: '⭐ Best Streak', value: String(stats.best_streak), inline: true },
    );
}

function h2hEmbed(h2h) {
  return new EmbedBuilder()
    .setColor(COLOURS.info)
    .setTitle(`⚔️ Head to Head`)
    .setDescription(`**${h2h.user1_name}** vs **${h2h.user2_name}**`)
    .addFields(
      { name: `${h2h.user1_name} Points`, value: String(h2h.user1_points), inline: true },
      { name: 'Draws', value: String(h2h.draws), inline: true },
      { name: `${h2h.user2_name} Points`, value: String(h2h.user2_points), inline: true },
      { name: `${h2h.user1_name} Wins`, value: String(h2h.user1_wins), inline: true },
      { name: '\u200b', value: '\u200b', inline: true },
      { name: `${h2h.user2_name} Wins`, value: String(h2h.user2_wins), inline: true },
    );
}

function errorEmbed(message) {
  return new EmbedBuilder().setColor(COLOURS.error).setDescription(`❌ ${message}`);
}

function successEmbed(message) {
  return new EmbedBuilder().setColor(COLOURS.success).setDescription(`✅ ${message}`);
}

module.exports = { matchEmbed, matchListEmbed, leaderboardEmbed, profileEmbed, h2hEmbed, errorEmbed, successEmbed };
