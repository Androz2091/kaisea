const { config } = require('dotenv');
config();

const { REST } = require('@discordjs/rest');
const { Routes, ApplicationCommandOptionType, ChannelType } = require('discord-api-types/v9');

const commands = [{
    name: 'watch',
    description: 'Watch a NFT slug from OpenSea!',
    options: [
        {
            name: 'fprice',
            description: 'Adds a new slug to the floor price watch list!',
            type: ApplicationCommandOptionType.Subcommand,
            options: [
                {
                    name: 'slug',
                    description: 'The slug of the collection to watch',
                    type: ApplicationCommandOptionType.String,
                    required: true
                }
            ]
        },
        {
            name: 'listing',
            description: 'Adds a new slug to the listing watch list!',
            type: ApplicationCommandOptionType.Subcommand,
            options: [
                {
                    name: 'slug',
                    description: 'The slug of the collection to watch',
                    type: ApplicationCommandOptionType.String,
                    required: true
                },
                {
                    name: 'channel',
                    description: 'The channel in which the listing notifications will be sent',
                    type: ApplicationCommandOptionType.Channel,
                    channel_types: [ChannelType.GuildText],
                    required: true
                }
            ]
        },
        {
            name: 'sales',
            description: 'Adds a new slug to the sales watch list!',
            type: ApplicationCommandOptionType.Subcommand,
            options: [
                {
                    name: 'slug',
                    description: 'The slug of the collection to watch',
                    type: ApplicationCommandOptionType.String,
                    required: true
                },
                {
                    name: 'channel',
                    description: 'The channel in which the sales notifications will be sent',
                    type: ApplicationCommandOptionType.Channel,
                    channel_types: [ChannelType.GuildText],
                    required: true
                }
            ]
        }
    ]
}, {
    name: 'unwatch',
    description: 'Unwatch a NFT slug from OpenSea!',
    options: [
        {
            name: 'fprice',
            description: 'Removes a slug from the floor price watch list!',
            type: ApplicationCommandOptionType.Subcommand,
            options: [
                {
                    name: 'slug',
                    description: 'The slug of the collection to un-watch',
                    type: ApplicationCommandOptionType.String,
                    required: true
                }
            ]
        },
        {
            name: 'listing',
            description: 'Removes a new slug from the listing watch list!',
            type: ApplicationCommandOptionType.Subcommand,
            options: [
                {
                    name: 'slug',
                    description: 'The slug of the collection to un-watch',
                    type: ApplicationCommandOptionType.String,
                    required: true
                }
            ]
        },
        {
            name: 'sales',
            description: 'Removes a slug from the sales watch list!',
            type: ApplicationCommandOptionType.Subcommand,
            options: [
                {
                    name: 'slug',
                    description: 'The slug of the collection to un-watch',
                    type: ApplicationCommandOptionType.String,
                    required: true
                }
            ]
        }
    ]
}, {
    name: 'watch-list',
    description: 'List all watched NFT slugs from OpenSea!',
    options: []
}, {
    name: 'stats',
    description: 'Get stats about a NFT slug from OpenSea! (premium-only)',
    options: [
        {
            name: 'slug',
            description: 'Slug of the collection',
            type: ApplicationCommandOptionType.String,
            required: true
        }
    ]
}, {
    name: 'license',
    description: 'Link your NFTs Watcher Premium license',
    options: [
        {
            name: 'license',
            description: 'Your license key',
            type: ApplicationCommandOptionType.String,
            required: true
        }
    ]
}, {
    name: 'config',
    description: 'Change the server configuration!',
    options: [
        {
            name: 'default_watch_category',
            description: 'Change the default category for floor price channels!',
            type: ApplicationCommandOptionType.Subcommand,
            options: [
                {
                    name: 'category',
                    description: 'The default category',
                    type: ApplicationCommandOptionType.Channel,
                    channel_types: [ChannelType.GuildCategory],
                    required: true
                }
            ]
        },
        {
            name: 'watch_permissions',
            description: 'Change the permissions to modify the watch list!',
            type: ApplicationCommandOptionType.Subcommand,
            options: [
                {
                    name: 'type',
                    description: 'The new permissions',
                    type: ApplicationCommandOptionType.String,
                    choices: [{
                        name: 'admin',
                        value: 'admin'
                    }, {
                        name: 'everyone',
                        value: 'everyone'
                    }],
                    required: true
                }
            ]
        }
    ]
}];

const rest = new REST({ version: '9' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log('Started refreshing application (/) commands.');

        await rest.put(
            Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, '890617349068165180'),
            { body: commands }
        ).then(console.log);
        
/*
        await rest.put(
            Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
            { body: commands }
        ).then(console.log);
*/
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
})();