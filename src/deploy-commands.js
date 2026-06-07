require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
  // User commands
  new SlashCommandBuilder()
    .setName('predict')
    .setDescription('Submit your prediction for a match')
    .addStringOption(o => o.setName('competition').setDescription('Filter by competition').addChoices(
      { name: 'Premier League', value: 'Premier League' },
      { name: 'World Cup', value: 'World Cup' }
    )),

  new SlashCommandBuilder()
    .setName('predictgw')
    .setDescription('Quickly predict all matches in the next open Premier League gameweek'),

  new SlashCommandBuilder()
    .setName('matches')
    .setDescription('View upcoming matches')
    .addStringOption(o => o.setName('competition').setDescription('Filter by competition').addChoices(
      { name: 'Premier League', value: 'Premier League' },
      { name: 'World Cup', value: 'World Cup' }
    ))
    .addIntegerOption(o => o.setName('gameweek').setDescription('Filter by gameweek (PL only)')),

  new SlashCommandBuilder()
    .setName('fixtures')
    .setDescription('Show upcoming fixtures from the API')
    .addStringOption(o => o.setName('when').setDescription('When').addChoices(
      { name: 'Today', value: 'today' },
      { name: 'Tomorrow', value: 'tomorrow' },
      { name: 'All upcoming', value: 'all' }
    ))
    .addStringOption(o => o.setName('competition').setDescription('Filter by competition').addChoices(
      { name: 'Premier League', value: 'Premier League' },
      { name: 'World Cup', value: 'World Cup' }
    )),

  new SlashCommandBuilder()
    .setName('results')
    .setDescription('Show recent results')
    .addStringOption(o => o.setName('competition').setDescription('Filter by competition').addChoices(
      { name: 'Premier League', value: 'Premier League' },
      { name: 'World Cup', value: 'World Cup' }
    )),

  new SlashCommandBuilder()
    .setName('mypredictions')
    .setDescription('View all your predictions'),

  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show standings')
    .addStringOption(o => o.setName('competition').setDescription('Filter').addChoices(
      { name: 'Premier League', value: 'Premier League' },
      { name: 'World Cup', value: 'World Cup' },
      { name: 'Overall', value: 'overall' }
    ))
    .addIntegerOption(o => o.setName('gameweek').setDescription('Show a specific gameweek (PL)'))
    .addStringOption(o => o.setName('date').setDescription('Show a specific date (YYYY-MM-DD) for World Cup')),

  new SlashCommandBuilder()
    .setName('profile')
    .setDescription("View your stats or another player's")
    .addUserOption(o => o.setName('user').setDescription('User to view (leave blank for yourself)')),

  new SlashCommandBuilder()
    .setName('scoring')
    .setDescription('Show how the scoring system works'),

  new SlashCommandBuilder()
    .setName('h2h')
    .setDescription('Head-to-head comparison between two players')
    .addUserOption(o => o.setName('user1').setDescription('First player').setRequired(true))
    .addUserOption(o => o.setName('user2').setDescription('Second player').setRequired(true)),

  // Admin commands
  new SlashCommandBuilder()
    .setName('addmatch')
    .setDescription('[ADMIN] Add a new match')
    .addStringOption(o => o.setName('competition').setDescription('Competition').setRequired(true).addChoices(
      { name: 'Premier League', value: 'Premier League' },
      { name: 'World Cup', value: 'World Cup' }
    ))
    .addStringOption(o => o.setName('home_team').setDescription('Home team').setRequired(true))
    .addStringOption(o => o.setName('away_team').setDescription('Away team').setRequired(true))
    .addStringOption(o => o.setName('match_date').setDescription('Date (e.g. 12 Aug 2025 15:00)').setRequired(true))
    .addIntegerOption(o => o.setName('gameweek').setDescription('Gameweek number (PL)')),

  new SlashCommandBuilder()
    .setName('setresult')
    .setDescription('[ADMIN] Set match result and award points')
    .addIntegerOption(o => o.setName('match_id').setDescription('Match ID').setRequired(true))
    .addIntegerOption(o => o.setName('home_score').setDescription('Home score').setRequired(true).setMinValue(0))
    .addIntegerOption(o => o.setName('away_score').setDescription('Away score').setRequired(true).setMinValue(0)),

  new SlashCommandBuilder()
    .setName('lockmatch')
    .setDescription('[ADMIN] Lock a match manually')
    .addIntegerOption(o => o.setName('match_id').setDescription('Match ID').setRequired(true)),

  new SlashCommandBuilder()
    .setName('matchpredictions')
    .setDescription('[ADMIN] View all predictions for a match')
    .addIntegerOption(o => o.setName('match_id').setDescription('Match ID').setRequired(true)),

  new SlashCommandBuilder()
    .setName('setchannel')
    .setDescription('[ADMIN] Set the channel for auto announcements')
    .addChannelOption(o => o.setName('channel').setDescription('Channel to post announcements').setRequired(true)),

  new SlashCommandBuilder()
    .setName('sync')
    .setDescription('[ADMIN] Sync fixtures and results from the API'),

  new SlashCommandBuilder()
    .setName('admincheck')
    .setDescription('[ADMIN] Check bot/database status'),

  new SlashCommandBuilder()
    .setName('audit')
    .setDescription('[ADMIN] View recent prediction audit log entries')
    .addUserOption(o => o.setName('user').setDescription('Filter by user (optional)'))
    .addIntegerOption(o => o.setName('match_id').setDescription('Filter by match ID (optional)')),

  new SlashCommandBuilder()
    .setName('remindmissing')
    .setDescription('[ADMIN] Show users who have not predicted all matches in the current open set'),

].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('Registering slash commands...');
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log('✅ Slash commands registered!');
  } catch (err) {
    console.error('❌ Failed:', err);
  }
})();
