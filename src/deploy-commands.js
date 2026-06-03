require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
  // ── User commands ──────────────────────────────────────────

  new SlashCommandBuilder()
    .setName('predict')
    .setDescription('Submit your prediction for a match')
    .addIntegerOption(o =>
      o.setName('match_id').setDescription('Match ID (use /matches to find it)').setRequired(true))
    .addIntegerOption(o =>
      o.setName('home_score').setDescription('Predicted home team score').setRequired(true).setMinValue(0))
    .addIntegerOption(o =>
      o.setName('away_score').setDescription('Predicted away team score').setRequired(true).setMinValue(0)),

  new SlashCommandBuilder()
    .setName('matches')
    .setDescription('View upcoming matches you can predict')
    .addStringOption(o =>
      o.setName('competition')
        .setDescription('Filter by competition')
        .addChoices(
          { name: 'Premier League', value: 'Premier League' },
          { name: 'World Cup', value: 'World Cup' }
        )),

  new SlashCommandBuilder()
    .setName('mypredictions')
    .setDescription('View all your predictions for upcoming matches'),

  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show the prediction league standings')
    .addStringOption(o =>
      o.setName('competition')
        .setDescription('Filter by competition')
        .addChoices(
          { name: 'Premier League', value: 'Premier League' },
          { name: 'World Cup', value: 'World Cup' },
          { name: 'Overall', value: 'overall' }
        )),

  // ── Admin commands ─────────────────────────────────────────

  new SlashCommandBuilder()
    .setName('addmatch')
    .setDescription('[ADMIN] Add a new match to predict')
    .addStringOption(o =>
      o.setName('competition')
        .setDescription('Competition')
        .setRequired(true)
        .addChoices(
          { name: 'Premier League', value: 'Premier League' },
          { name: 'World Cup', value: 'World Cup' }
        ))
    .addStringOption(o =>
      o.setName('home_team').setDescription('Home team name').setRequired(true))
    .addStringOption(o =>
      o.setName('away_team').setDescription('Away team name').setRequired(true))
    .addStringOption(o =>
      o.setName('match_date').setDescription('Match date & time (e.g. 2024-05-12 15:00)').setRequired(true)),

  new SlashCommandBuilder()
    .setName('setresult')
    .setDescription('[ADMIN] Set the result of a match and award points')
    .addIntegerOption(o =>
      o.setName('match_id').setDescription('Match ID').setRequired(true))
    .addIntegerOption(o =>
      o.setName('home_score').setDescription('Actual home score').setRequired(true).setMinValue(0))
    .addIntegerOption(o =>
      o.setName('away_score').setDescription('Actual away score').setRequired(true).setMinValue(0)),

  new SlashCommandBuilder()
    .setName('lockmatch')
    .setDescription('[ADMIN] Lock a match so no more predictions can be submitted')
    .addIntegerOption(o =>
      o.setName('match_id').setDescription('Match ID').setRequired(true)),

  new SlashCommandBuilder()
    .setName('matchpredictions')
    .setDescription('[ADMIN] View all predictions for a specific match')
    .addIntegerOption(o =>
      o.setName('match_id').setDescription('Match ID').setRequired(true)),

  new SlashCommandBuilder()
    .setName('fixtures')
    .setDescription('Show upcoming fixtures from the football API')
    .addStringOption(o =>
      o.setName('competition')
        .setDescription('Filter by competition')
        .addChoices(
          { name: 'Premier League', value: 'Premier League' },
          { name: 'World Cup', value: 'World Cup' }
        )),

  new SlashCommandBuilder()
    .setName('results')
    .setDescription('Show recent match results')
    .addStringOption(o =>
      o.setName('competition')
        .setDescription('Filter by competition')
        .addChoices(
          { name: 'Premier League', value: 'Premier League' },
          { name: 'World Cup', value: 'World Cup' }
        )),

  new SlashCommandBuilder()
    .setName('sync')
    .setDescription('[ADMIN] Sync fixtures and results from the football API'),

].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('Registering slash commands...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('✅ Slash commands registered successfully!');
  } catch (err) {
    console.error('❌ Failed to register commands:', err);
  }
})();
