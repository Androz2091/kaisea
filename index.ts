import { config } from 'dotenv';
config();

import { Client, Intents, MessageEmbed } from 'discord.js';
import { SlugSubscription, Subscription } from './database';
import OpenSeaClient from './opensea';
import { synchronize } from './synchronization';

const openSeaClient = new OpenSeaClient();
const discordClient = new Client({
    intents: [Intents.FLAGS.GUILDS]
});

discordClient.on('ready', () => {
    console.log(`Logged in as ${discordClient.user!.tag}!`);
});

setInterval(() => {
    synchronize(discordClient, openSeaClient);
}, 15 * 60_000); // every 10 minutes

setInterval(async () => {

    // expires old subscriptions
    await Subscription.update({
        isActive: false
    }, {
        where: {
            isActive: true,
            expiresAt: {
                $lte: Date.now() + 1000 * 60 * 60 * 96 // 96 hours, to be safe
            }
        }
    });

    const guildSlugSubscriptions = await SlugSubscription.findAll({
        where: {
            isActive: true
        }
    });

    const guildSubscriptions = await Subscription.findAll({
        where: {
            isActive: true
        }
    });

    for (const guildSlugSubscription of guildSlugSubscriptions) {
        const subscriptions = guildSubscriptions.filter((subscription) => subscription.claimerDiscordGuildId === guildSlugSubscription.discordGuildId);
        if (subscriptions.length === 0) {
            await guildSlugSubscription.update({
                isActive: false
            });
        }
    }

}, 60_000 * 60 * 6); // 6 hours

discordClient.on('interactionCreate', async (interaction) => {

    if (!interaction.guild) return;
    if (!interaction.isCommand()) return;

    const member = interaction.guild.members.cache.get(interaction.user.id)
    ?? await interaction.guild.members.fetch(interaction.user.id);

    if (!member.permissions.has('ADMINISTRATOR')) {
        interaction.reply('You must be an administrator to use this command!');
        return; 
    }

    switch (interaction.commandName) {

        case 'watch': {

            const slugSubscriptions = await SlugSubscription.findAll({
                where: {
                    discordGuildId: interaction.guildId,
                    isActive: true
                }
            });

            const subscriptions = await Subscription.findAll({
                where: {
                    claimerDiscordGuildId: interaction.guildId,
                    isActive: true
                }
            });
            const maxSubscriptionsUsed = !subscriptions.length && slugSubscriptions.length > 0;
            if (maxSubscriptionsUsed) {
                interaction.reply('You must buy an active subscription at https://nfts-watcher.io to be able to add more than one watch channel! :rocket:');
                return;
            }

            const slug = interaction.options.getString('slug')!;

            if (slugSubscriptions.some((slugSubscription) => slugSubscription.slug === slug)) {
                interaction.reply('You are already watching this slug!');
                return;
            }

            interaction.deferReply();

            const { slugExists, floorPrice, error } = await openSeaClient.getSlugStats(slug);

            if (error) {
                interaction.followUp(error);
                return;
            }

            if (!slugExists) {
                interaction.followUp('This slug does not exist or does not have a floor price!');
                return;
            }

            const slugName = openSeaClient.formatSlugName(slug);
            const channel = await interaction.guild.channels.create(`${floorPrice} ETH | ${slugName}`, {
                type: 'GUILD_VOICE',
                permissionOverwrites: [
                    {
                        id: interaction.guild.id,
                        deny: ['CONNECT']
                    }
                ]
            }).catch(() => {
                interaction.followUp('Failed to create channel! Can you check my permissions?');
                return;
            });

            if (!channel) return;

            await SlugSubscription.create({
                slug,
                discordUserId: interaction.user.id,
                discordGuildId: interaction.guildId,
                discordChannelId: channel.id,
                createdAt: new Date(),
                isActive: true
            }).then(() => {
                interaction.followUp('You are now watching this slug! :rocket:');
            }).catch(() => {
                interaction.followUp('Something went wrong!');
            });
            break;
        }

        case 'unwatch': {

            const slugSubscriptions = await SlugSubscription.findAll({
                where: {
                    discordGuildId: interaction.guildId,
                    isActive: true
                }
            });

            const slug = interaction.options.getString('slug')!;

            if (!slugSubscriptions.some((slugSubscription) => slugSubscription.slug === slug)) {
                interaction.reply('You are not watching this slug!');
                return;
            }

            const slugSubscription = slugSubscriptions.find((slugSubscription) => slugSubscription.slug === slug)!;
            const channel = interaction.guild.channels.cache.get(slugSubscription.discordChannelId);
            if (channel) {
                await channel.delete();
            }

            await SlugSubscription.update({
                isActive: false
            }, {
                where: {
                    slug,
                    discordGuildId: interaction.guildId
                }
            }).then(() => {
                interaction.reply('You are no longer watching this slug!');
            }).catch(() => {
                interaction.reply('Something went wrong!');
            });
            break;
        }

        case 'watch-list': {
            const slugSubscriptions = await SlugSubscription.findAll({
                where: {
                    discordGuildId: interaction.guildId,
                    isActive: true
                }
            });

            const embeds = [
                new MessageEmbed()
                    .setAuthor('NFTs Watcher')
                    .setDescription(slugSubscriptions.length ? '' : 'You have no items in your watch list! Add new by using `/watch`!')
            ];
            slugSubscriptions.forEach((slugSubscription) => {
                const embed = embeds.at(-1)!;
                const description = embed.description!;
                const slugSubscriptionText = `[${slugSubscription.slug}](https://opensea.io/collection/${slugSubscription.slug})\n`;
                if ((description.length + slugSubscriptionText.length) > 2048) {
                    embeds.push(new MessageEmbed().setDescription(slugSubscriptionText));
                } else {
                    embed.setDescription(embed.description + slugSubscriptionText);
                }
            });

            embeds.forEach((embed) => embed.setColor('#0E4749'));
            embeds.at(-1)?.setFooter('Use /unwatch to remove an item from your watch list.');

            interaction.reply({ embeds });
            break;
        }

        case 'license': {
            const license = interaction.options.getString('license')!;
            const subscription = await Subscription.findOne({
                where: {
                    subId: license,
                    isActive: true
                }
            });
            if (!subscription) {
                interaction.reply('This license does not exist!');
                return;
            }
            subscription.claimerDiscordGuildId = interaction.guildId;
            await subscription.save();
            interaction.reply('You have successfully claimed this license!');
            break;
        }

        case 'stats': {
            const subscriptions = await Subscription.findAll({
                where: {
                    claimerDiscordGuildId: interaction.guildId,
                    isActive: true
                }
            });
            if (!subscriptions.length) {
                interaction.reply('You must buy an active subscription at https://nfts-watcher.io to be able to use this command! :rocket:');
                return;
            }

            const slug = interaction.options.getString('slug')!;

            interaction.deferReply();

            const { error, slugExists, floorPrice, volumeTraded, ownerCount, itemCount } = await openSeaClient.getSlugStats(slug);

            if (error) {
                interaction.followUp(error);
                return;
            }

            if (!slugExists) {
                interaction.followUp('This slug does not exist or does not have a floor price!');
                return;
            }

            const embed = new MessageEmbed()
                .setAuthor('NFTs Watcher')
                .setDescription(`📈 Statistics for collection [${slug}](https://opensea.io/collection/${slug})`)
                .addField('Floor Price', `${floorPrice} ETH`, true)
                .addField('Volume Traded', `${volumeTraded} ETH`, true)
                .addField('Owner Count', `${ownerCount}`, true)
                .addField('Item Count', `${itemCount}`, true)
                .setColor('#0E4749');
            
            interaction.followUp({ embeds: [embed] });
            break;
        }

    }

});

discordClient.login(process.env.DISCORD_TOKEN);

export default discordClient;
