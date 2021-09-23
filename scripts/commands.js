const { config } = require('dotenv');
config();

const { REST } = require('@discordjs/rest');
const { Routes, ApplicationCommandOptionType } = require('discord-api-types/v9');

const commands = [{
    name: 'watch',
    description: 'Watch a NFT slug from OpenSea!',
    options: [
        {
            name: 'slug',
            description: 'Slug of the collection',
            type: ApplicationCommandOptionType.String,
            required: true
        }
    ]
}, {
    name: 'unwatch',
    description: 'Unwatch a NFT slug from OpenSea!',
    options: [
        {
            name: 'slug',
            description: 'Slug of the collection',
            type: ApplicationCommandOptionType.String,
            required: true
        }
    ]
}, {
    name: 'watch-list',
    description: 'List all watched NFT slugs from OpenSea!',
    options: []
}];

const rest = new REST({ version: '9' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log('Started refreshing application (/) commands.');

        await rest.put(
            Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
            { body: commands }
        ).then(console.log);

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
})();