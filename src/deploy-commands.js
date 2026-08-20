require('dotenv').config();
const { REST, Routes } = require('discord.js');
const commands = require('./commands');

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('Registering slash commands...');
    if (process.env.GUILD_ID) {
      await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: [] });
      await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands });
      console.log('✅ Slash commands registered (guild-scoped)!');
    } else {
      await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
      console.log('✅ Slash commands registered (global)!');
    }
  } catch (err) {
    console.error('❌ Failed:', err);
  }
})();
