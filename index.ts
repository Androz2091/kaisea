import 'reflect-metadata';
import { config } from 'dotenv';
config();

import { Client, Intents, MessageEmbed } from 'discord.js';
import { connection, initialize, NotificationSubscription, SlugSubscription, Subscription } from './database';
import OpenSeaClient from './opensea';
import { synchronizeFloorPrice, synchronizeEvents } from './synchronization';
import { LessThanOrEqual } from 'typeorm';

initialize();

const openSeaClient = new OpenSeaClient();
const discordClient = new Client({
    intents: [Intents.FLAGS.GUILDS]
});

discordClient.on('ready', () => {
    console.log(`Logged in as ${discordClient.user!.tag}!`);
});

setInterval(() => {
    synchronizeFloorPrice(discordClient, openSeaClient);
}, 15 * 60_000); // every 10 minutes

setInterval(() => {
    synchronizeEvents(discordClient, openSeaClient);
}, 10_000);

setInterval(async () => {

    // expires old subscriptions
    await connection.getRepository(Subscription).update({
        isActive: true,
        expiresAt: LessThanOrEqual(Date.now() + 1000 * 60 * 60 * 96)
    }, {
        isActive: false
    });

    const guildSlugSubscriptions = await connection.getRepository(SlugSubscription).find({
        isActive: true
    });

    const guildSubscriptions = await connection.getRepository(Subscription).find({
        isActive: true
    });

    for (const guildSlugSubscription of guildSlugSubscriptions) {
        const subscriptions = guildSubscriptions.filter((subscription) => subscription.claimerDiscordGuildId === guildSlugSubscription.discordGuildId);
        if (subscriptions.length === 0) {
            guildSlugSubscription.isActive = false;
            await connection.manager.save(guildSlugSubscription);
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

            const subCommand = interaction.options.getSubcommand(true);

            const subscriptions = await connection.getRepository(Subscription).find({
                claimerDiscordGuildId: interaction.guildId!,
                isActive: true
            });

            if (subCommand === 'fprice') {
                const slugSubscriptions = await connection.getRepository(SlugSubscription).find({
                    discordGuildId: interaction.guildId!,
                    isActive: true
                });
    
                const maxSubscriptionsUsed = !subscriptions.length && slugSubscriptions.length > 0;
                if (maxSubscriptionsUsed) {
                    interaction.reply('You must buy an active subscription at https://kaisea.io to be able to add more than one watch channel! :rocket:');
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
                const channel = await interaction.guild.channels.create(`${floorPrice} Ξ | ${slugName}`, {
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
    
                await connection.getRepository(SlugSubscription).insert({
                    slug,
                    discordUserId: interaction.user.id,
                    discordGuildId: interaction.guildId!,
                    discordChannelId: channel.id,
                    createdAt: new Date(),
                    isActive: true
                }).then(() => {
                    interaction.followUp('You are now watching this slug! :rocket:');
                }).catch((err) => {
                    console.error(err);
                    interaction.followUp('Something went wrong!');
                });
            } else if (subCommand === 'listing') {
                const listingSubscriptions = await connection.getRepository(NotificationSubscription).find({
                    type: 'created',
                    discordGuildId: interaction.guildId!,
                    isActive: true
                });
    
                const maxSubscriptionsUsed = !subscriptions.length && listingSubscriptions.length > 0;
                if (maxSubscriptionsUsed) {
                    interaction.reply('You must buy an active subscription at https://kaisea.io to be able to add more than one listing channel! :rocket:');
                    return;
                }
    
                const slug = interaction.options.getString('slug')!;
                const channel = interaction.options.getChannel('channel')!;
    
                if (listingSubscriptions.some((listingSubscription) => listingSubscription.slug === slug)) {
                    interaction.reply('You are already watching this slug for listing notifications!');
                    return;
                }
    
                interaction.deferReply();
    
                const { slugExists } = await openSeaClient.getCollectionEvents(slug, 'created');
    
                if (!slugExists) {
                    interaction.followUp('This slug does not exist!');
                    return;
                }
    
                await connection.getRepository(NotificationSubscription).insert({
                    slug,
                    type: 'created',
                    discordUserId: interaction.user.id,
                    discordGuildId: interaction.guildId!,
                    discordChannelId: channel.id,
                    createdAt: new Date(),
                    isActive: true
                }).then(() => {
                    interaction.followUp('You are now watching this slug for listing notifications! :rocket:');
                }).catch((err) => {
                    console.error(err);
                    interaction.followUp('Something went wrong!');
                });
            } else if (subCommand === 'sales') {
                const salesSubscriptions = await connection.getRepository(NotificationSubscription).find({
                    type: 'successful',
                    discordGuildId: interaction.guildId!,
                    isActive: true
                });
    
                const maxSubscriptionsUsed = !subscriptions.length && salesSubscriptions.length > 0;
                if (maxSubscriptionsUsed) {
                    interaction.reply('You must buy an active subscription at https://kaisea.io to be able to add more than one sale channel! :rocket:');
                    return;
                }
    
                const slug = interaction.options.getString('slug')!;
                const channel = interaction.options.getChannel('channel')!;
    
                if (salesSubscriptions.some((salesSubscription) => salesSubscription.slug === slug)) {
                    interaction.reply('You are already watching this slug for sales notifications!');
                    return;
                }
    
                interaction.deferReply();
    
                const { slugExists } = await openSeaClient.getCollectionEvents(slug, 'successful');
    
                if (!slugExists) {
                    interaction.followUp('This slug does not exist!');
                    return;
                }
    
                await connection.getRepository(NotificationSubscription).insert({
                    slug,
                    type: 'successful',
                    discordUserId: interaction.user.id,
                    discordGuildId: interaction.guildId!,
                    discordChannelId: channel.id,
                    createdAt: new Date(),
                    isActive: true
                }).then(() => {
                    interaction.followUp('You are now watching this slug for listing notifications! :rocket:');
                }).catch((err) => {
                    console.error(err);
                    interaction.followUp('Something went wrong!');
                });
            }
            break;
        }

        case 'unwatch': {

            const subCommand = interaction.options.getSubcommand(true);

            if (subCommand === 'fprice') {
                const slugSubscriptions = await connection.getRepository(SlugSubscription).find({
                    discordGuildId: interaction.guildId!,
                    isActive: true
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
    
                await connection.getRepository(SlugSubscription).update({
                    slug,
                    discordGuildId: interaction.guildId!
                }, {
                    isActive: false
                }).then(() => {
                    interaction.reply('You are no longer watching this slug!');
                }).catch(() => {
                    interaction.reply('Something went wrong!');
                });
            } else if (subCommand === 'listing') {
                const listingSubscriptions = await connection.getRepository(NotificationSubscription).find({
                    type: 'created',
                    discordGuildId: interaction.guildId!,
                    isActive: true
                });
    
                const slug = interaction.options.getString('slug')!;
    
                if (!listingSubscriptions.some((listingSubscription) => listingSubscription.slug === slug)) {
                    interaction.reply('You are not watching this slug for listing notifications!');
                    return;
                }
    
                await connection.getRepository(NotificationSubscription).update({
                    slug,
                    type: 'created',
                    discordGuildId: interaction.guildId!
                }, {
                    isActive: false
                }).then(() => {
                    interaction.reply('You are no longer watching this slug!');
                }).catch(() => {
                    interaction.reply('Something went wrong!');
                });
            }  else if (subCommand === 'sales') {
                const salesSubscriptions = await connection.getRepository(NotificationSubscription).find({
                    type: 'successful',
                    discordGuildId: interaction.guildId!,
                    isActive: true
                });
    
                const slug = interaction.options.getString('slug')!;
    
                if (!salesSubscriptions.some((salesSubscription) => salesSubscription.slug === slug)) {
                    interaction.reply('You are not watching this slug for sales notifications!');
                    return;
                }
    
                await connection.getRepository(NotificationSubscription).update({
                    slug,
                    type: 'successful',
                    discordGuildId: interaction.guildId!
                }, {
                    isActive: false
                }).then(() => {
                    interaction.reply('You are no longer watching this slug!');
                }).catch(() => {
                    interaction.reply('Something went wrong!');
                });
            }
            break;
        }

        case 'watch-list': {
            const slugSubscriptions = await connection.getRepository(SlugSubscription).find({
                discordGuildId: interaction.guildId!,
                isActive: true
            });
            const notificationSubscriptions = await connection.getRepository(NotificationSubscription).find({
                discordGuildId: interaction.guildId!,
                isActive: true
            });
            const watchList = [...slugSubscriptions, ...notificationSubscriptions];

            const embeds = [
                new MessageEmbed()
                    .setAuthor('Kaisea Watch List')
                    .setDescription(watchList.length ? '' : 'You have no items in your watch list! Add new by using `/watch`!')
            ];
            watchList.forEach((watchItem) => {
                const embed = embeds.at(-1)!;
                const description = embed.description!;
                let watchItemText = '';
                if (watchItem instanceof SlugSubscription) {
                    watchItemText = `[${watchItem.slug}](https://opensea.io/collection/${watchItem.slug}) (floor price)\n`;
                } else if (watchItem instanceof NotificationSubscription) {
                    watchItemText = `[${watchItem.slug}](https://opensea.io/collection/${watchItem.slug}) in <#${watchItem.discordChannelId}> (${watchItem.type === 'created' ? 'listing' : 'sales'})`
                }
                if ((description.length + watchItemText.length) > 2048) {
                    embeds.push(new MessageEmbed().setDescription(watchItemText));
                } else {
                    embed.setDescription(embed.description + watchItemText);
                }
            });

            embeds.forEach((embed) => embed.setColor('#0E4749'));
            embeds.at(-1)?.setFooter('Use /unwatch to remove an item from your watch list.');

            interaction.reply({ embeds });
            break;
        }

        case 'license': {
            const license = interaction.options.getString('license')!;
            const subscription = await connection.getRepository(Subscription).findOne({
                subId: license,
                isActive: true
            });
            if (!subscription) {
                interaction.reply('This license does not exist!');
                return;
            }
            subscription.claimerDiscordGuildId = interaction.guildId!;
            await connection.manager.save(subscription);
            interaction.reply('You have successfully claimed this license!');
            break;
        }

        case 'stats': {
            const subscriptions = await connection.getRepository(Subscription).find({
                claimerDiscordGuildId: interaction.guildId!,
                isActive: true
            });
            if (!subscriptions.length) {
                interaction.reply('You must buy an active subscription at https://nfts-watcher.io to be able to use this command! :rocket:');
                return;
            }

            const slug = interaction.options.getString('slug')!;

            interaction.deferReply();

            const { error, slugExists, floorPrice, volumeTraded, ownerCount, itemCount, iconImageURL, bannerImageURL } = await openSeaClient.getSlugStats(slug);

            if (error) {
                interaction.followUp(error);
                return;
            }

            if (!slugExists) {
                interaction.followUp('This slug does not exist or does not have a floor price!');
                return;
            }

            const embed = new MessageEmbed()
                .setAuthor('Kaisea', iconImageURL)
                .setImage(bannerImageURL!)
                .setDescription(`📈 Statistics for collection [${slug}](https://opensea.io/collection/${slug})`)
                .addField('Floor Price', `${floorPrice} Ξ`, true)
                .addField('Volume Traded', `${volumeTraded} Ξ`, true)
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
