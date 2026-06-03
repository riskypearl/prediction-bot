const { EmbedBuilder } = require('discord.js');

const COLOURS = {
  'Premier League': 0x3d195b, // PL purple
  'World Cup': 0xc8aa5a,      // Gold
  success: 0x57f287,
  error: 0xed4245,
  info: 0x5865f2,
  leaderboard: 0xfee75c,
};

const COMP_EMOJI = {
  'Premier League': '🦁',
  'World Cup': '🌍',
};

function matchEmbed(match, title = null) {
  const emoji = COMP_EMOJI[match.competition] || '⚽';
  const colour = COLOURS[match.competition] || COLOURS.info;
  const locked = match.locked ? ' 🔒' : '';
  const result = match.home_score !== null
    ? `**${match.home_score} – ${match.away_score}**`
    : 'Pending';

  return new EmbedBuilder()
    .setColor(colour)
    .setTitle(title || `${emoji} Match #${match.id}${locked}`)
    .addFields(
      { name: 'Competition', value: match.competition, inline: true },
      { name: 'Date', value: match.match_date, inline: true },
      { name: '\u200b', value: '\u200b', inline: true },
      { name: '🏠 Home', value: match.home_team, inline: true },
      { name: '✈️ Away', value: match.away_team, inline: true },
      { name: '📊 Result', value: result, inline: true },
    );
}

function matchListEmbed(matches, competition = null) {
  const title = competition
    ? `${COMP_EMOJI[competition] || '⚽'} Upcoming ${competition} Matches`
    : '⚽ Upcoming Matches';

  const embed = new EmbedBuilder()
    .setColor(competition ? COLOURS[competition] : COLOURS.info)
    .setTitle(title)
    .setFooter({ text: 'Use /predict <match_id> to submit your prediction' });

  if (matches.length === 0) {
    embed.setDescription('No upcoming matches. Ask an admin to add some!');
    return embed;
  }

  const lines = matches.map(m => {
    const lock = m.locked ? ' 🔒' : '';
    return `**#${m.id}** ${m.home_team} vs ${m.away_team}${lock}\n📅 ${m.match_date} · ${m.competition}`;
  });

  embed.setDescription(lines.join('\n\n'));
  return embed;
}

function leaderboardEmbed(rows, competition = null) {
  const title = competition && competition !== 'overall'
    ? `${COMP_EMOJI[competition] || '🏆'} ${competition} Leaderboard`
    : '🏆 Overall Leaderboard';

  const embed = new EmbedBuilder()
    .setColor(COLOURS.leaderboard)
    .setTitle(title)
    .setFooter({ text: '🎯 Exact score = 3pts · ✅ Correct result = 1pt' });

  if (rows.length === 0) {
    embed.setDescription('No scores yet!');
    return embed;
  }

  const medals = ['🥇', '🥈', '🥉'];
  const lines = rows.map((r, i) => {
    const pos = medals[i] || `**${i + 1}.**`;
    return `${pos} **${r.username}** — ${r.total_points} pts *(🎯 ${r.exact_scores} · ✅ ${r.correct_results})*`;
  });

  embed.setDescription(lines.join('\n'));
  return embed;
}

function errorEmbed(message) {
  return new EmbedBuilder().setColor(COLOURS.error).setDescription(`❌ ${message}`);
}

function successEmbed(message) {
  return new EmbedBuilder().setColor(COLOURS.success).setDescription(`✅ ${message}`);
}

module.exports = { matchEmbed, matchListEmbed, leaderboardEmbed, errorEmbed, successEmbed };
