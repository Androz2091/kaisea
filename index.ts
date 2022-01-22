import 'reflect-metadata';
import { config } from 'dotenv';
config();

import { Client, Intents, MessageAttachment, MessageEmbed } from 'discord.js';
import { connection, GuildSettings, initialize, NotificationSubscription, SlugSubscription, Subscription } from './database';
import OpenSeaClient from './opensea';
import { synchronizeFloorPrice, synchronizeEvents } from './synchronization';
import { LessThanOrEqual } from 'typeorm';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import uuid from 'uuidv4';

process.env.TZ = "GMT";

initialize();

const openSeaClient = new OpenSeaClient();
const discordClient = new Client({
    intents: [Intents.FLAGS.GUILDS]
});

discordClient.on('ready', () => {
    console.log(`Logged in as ${discordClient.user!.tag}!`);

    if (process.argv.includes('--sync')) {
        synchronizeFloorPrice(discordClient, openSeaClient);
    }
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

    const subscriptions = await connection.getRepository(Subscription).find({
        claimerDiscordGuildId: interaction.guildId!,
        isActive: true
    });

    const maxSubscriptionsUsed = !subscriptions.length;
    if (maxSubscriptionsUsed && interaction.commandName !== 'license') {
        interaction.reply('You must buy an active subscription at https://kaisea.io to be able to use the bot! :rocket:');
        return;
    }

    switch (interaction.commandName) {

        case 'watch': {
            const settings = await connection.getRepository(GuildSettings).findOne({
                guildId: interaction.guildId!
            });

            if (settings?.watchPermissions == 'admin' && !member.permissions.has('ADMINISTRATOR')) {
                interaction.reply('You must be an administrator to use this command!');
                return; 
            }

            const subCommand = interaction.options.getSubcommand(true);

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
    
                const slugStats = await openSeaClient.getSlugStats(slug);
    
                if (!slugStats) {
                    interaction.followUp('This slug does not exist or does not have a floor price!');
                    return;
                }
    
                const slugName = slugStats.name;
                const floorPrice = slugStats.stats.floor_price;
                const channel = await interaction.guild.channels.create(`${floorPrice} Ξ | ${slugName}`, {
                    type: 'GUILD_VOICE',
                    parent: settings?.defaultWatchCategory,
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

            const settings = await connection.getRepository(GuildSettings).findOne({
                guildId: interaction.guildId!
            });

            if (settings?.watchPermissions == 'admin' && !member.permissions.has('ADMINISTRATOR')) {
                interaction.reply('You must be an administrator to use this command!');
                return; 
            }

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
                    watchItemText = `[${watchItem.slug}](https://opensea.io/collection/${watchItem.slug}) in <#${watchItem.discordChannelId}> (${watchItem.type === 'created' ? 'listing' : 'sales'})\n`
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

        case 'create-license': {
            const ownerIds = process.env.OWNER_DISCORD_IDS!.split(',');
            if (!ownerIds.includes(interaction.user.id)) {
                interaction.reply('You are not an owner of this bot!');
                return;
            }
            const subId = uuid.uuid();
            await connection.getRepository(Subscription).insert({
                subId,
                subType: '',
                createdAt: new Date(),
                expiresAt: new Date('2025-01-01'),
                isActive: true,
                modDiscordId: interaction.user.id
            });
            interaction.reply(`You have successfully created a license! ID has been sent in DMS.`);
            interaction.user.send(`Your license ID is: ${subId}`);
            break;
        }

        case 'config': {
            const member = await interaction.guild.members.fetch(interaction.user.id);
            if (!member.permissions.has('ADMINISTRATOR')) {
                return interaction.reply('You do not have the right permissions to change the settings.');
            }
            const settings = await connection.getRepository(GuildSettings).findOne({
                guildId: interaction.guildId!
            });
            if (!settings) {
                await connection.getRepository(GuildSettings).insert({
                    guildId: interaction.guildId!
                });
            }
            const subCommand = interaction.options.getSubcommand(true);
            if (subCommand === 'watch_permissions') {
                const newSetting = interaction.options.getString('type')!;
                await connection.getRepository(GuildSettings).update({
                    guildId: interaction.guildId!
                }, {
                    watchPermissions: newSetting
                });
                interaction.reply(`You have set the watch permissions to ${newSetting}!`);
            } else if (subCommand === 'default_watch_category') {
                const newSetting = interaction.options.getChannel('category')!;
                await connection.getRepository(GuildSettings).update({
                    guildId: interaction.guildId!
                }, {
                    defaultWatchCategory: newSetting.id
                });
                interaction.reply(`You have set the default watch category to ${newSetting}!`);
            }
            break;
        }

        case 'stats': {

            const slug = interaction.options.getString('slug')!;

            interaction.deferReply();

            const slugStats = await openSeaClient.getSlugStats(slug);

            if (!slugStats) {
                interaction.followUp('This slug does not exist or does not have a floor price!');
                return;
            }

            const buynowCount = await openSeaClient.getBuynowItems(slug).catch((e) => console.error(e));

            const historyPerDay = await connection.manager.query(`
                SELECT to_char("createdAt"::date, 'DD/MM'), AVG(value) FROM floor_price_history
                WHERE "createdAt"::date > NOW() - interval '7 days'
                AND slug = '${slug}'
                GROUP by 1
            `);
            
            const lastDayData = historyPerDay.at(-1);
            let difference;
            let image;
            if (lastDayData) {
                difference = (((slugStats.stats.floor_price - lastDayData.avg) / lastDayData.avg) * 100);
                let chartJSNodeCanvas = new ChartJSNodeCanvas({
                    width: 400,
                    height: 200
                })
                image = await chartJSNodeCanvas.renderToBuffer({
                    type: "line",
                    data: {
                        labels: historyPerDay.map((data: any) => data.to_char),
                        datasets: [
                            {
                                label: "Average Floor Price",
                                data: historyPerDay.map((data: any) => data.avg),
                                borderColor: "rgb(61,148,192)",
                                fill: true,
                                backgroundColor: "rgba(61,148,192,0.1)"
                            }
                        ]
                    },
                    options: {
                        plugins: {
                            legend: {
                                display: false
                            }
                        }
                    }
                });
            }

            const embed = new MessageEmbed()
                .setAuthor('Kaisea', discordClient.user?.displayAvatarURL())
                .setImage(image ? 'attachment://image.png' : slugStats.large_image_url!)
                .setDescription(`📈 Statistics for collection [${slug}](https://opensea.io/collection/${slug})`)
                .addField('Floor Price', `${(slugStats.stats.floor_price as number).toLocaleString('en-US', {
                    maximumFractionDigits: 2
                })} Ξ`)

            if (difference) {
                embed.addField('Difference (24hrs)', `${difference ? (`${difference > 0 ? `+${Math.abs(difference).toFixed(2)}% 🔼` : `-${Math.abs(difference).toFixed(2)}% 🔽`}`) : ''}`);
            }

            embed.addField('Volume Traded', `${parseInt(slugStats.stats.total_volume).toLocaleString('en-US')} Ξ`);

            if (buynowCount) {
                embed.addField('Items being sold', buynowCount.toLocaleString('en-US'));
            }

            embed.addField('Owner Count', slugStats.stats.num_owners.toLocaleString('en-US'))
                .addField('Item Count', slugStats.stats.total_supply.toLocaleString('en-US'))
                .setColor('#0E4749');
            
            interaction.followUp({ embeds: [embed], files: image ? [new MessageAttachment(image, "image.png")] : undefined });
            break;
        }

    }

});

discordClient.login(process.env.DISCORD_TOKEN);

export default discordClient;
