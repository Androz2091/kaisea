import { connection, FloorPriceHistory, NotificationSubscription, SlugSubscription } from "./database";
import type OpenSeaClient from "./opensea";
import { Client, MessageEmbed, TextChannel, VoiceChannel } from "discord.js";
import { ethers } from 'ethers';

export const synchronizeEvents = async (discordClient: Client, openseaClient: OpenSeaClient) => {

    const notificationSubscriptions = await connection.getRepository(NotificationSubscription).find({
        isActive: true
    });

    const promises = notificationSubscriptions.map(async (notificationSubscription) => {
        
        const slug = notificationSubscription.slug;
        const type = notificationSubscription.type as 'created' | 'successful';
        const lastSync = new Date(notificationSubscription.lastSyncAt).getTime();
        const channelId = notificationSubscription.discordChannelId;
        const channel = discordClient.channels.cache.get(channelId) as TextChannel;
        
        if (!channel) return;

        console.log(`Channel found for notif subscription #${notificationSubscription.id}`);

        const { events } = await openseaClient.getCollectionEvents(slug, type, lastSync);

        await connection.getRepository(NotificationSubscription).update({
            isActive: true
        }, {
            lastSyncAt: new Date()
        });

        const sendPromises: Promise<void>[] = [];
        (!lastSync ? events : [events[0]]).forEach((event) => {
            if (!event) return;
            let eventData = event as any;
            const url = `https://opensea.io/assets/${eventData.asset.asset_contract.address}/${eventData.asset.token_id}`;
            if (type === 'created') {
                const embed = new MessageEmbed()
                    .setTitle(`${eventData.asset.name} has been listed !`)
                    .setURL(url)
                    .setThumbnail(eventData.asset.collection.banner_image_url)
                    .setImage(eventData.asset.image_url)
                    .addField('Name', eventData.asset.name)
                    .addField('Amount', `${ethers.utils.formatEther(eventData.starting_price ? eventData.starting_price.toFixed(2) : '0')}${ethers.constants.EtherSymbol}`)
                    .setFooter('Listed on OpenSea', discordClient.user?.displayAvatarURL())
                    .setTimestamp(new Date(eventData.created_date))
                    .setColor('DARK_AQUA');
                sendPromises.push(new Promise((resolve) => {
                    channel.send({
                        embeds: [embed]
                    }).finally(() => resolve());
                }));
            } else if (type === 'successful') {
                const embed = new MessageEmbed()
                    .setTitle(`${eventData.asset.name} has been sold !`)
                    .setURL(url)
                    .setThumbnail(eventData.asset.collection.banner_image_url)
                    .setImage(eventData.asset.image_url)
                    .addField('Name', eventData.asset.name)
                    .addField('Amount', `${ethers.utils.formatEther(eventData.total_price || '0')}${ethers.constants.EtherSymbol}`)
                    .addField('Buyer', eventData?.winner_account?.address)
                    .addField('Seller', eventData?.seller?.address)
                    .setFooter('Sold on OpenSea', discordClient.user?.displayAvatarURL())
                    .setTimestamp(new Date(eventData.created_date))
                    .setColor('DARK_AQUA');
                sendPromises.push(new Promise((resolve) => {
                    channel.send({
                        embeds: [embed]
                    }).finally(() => resolve());
                }));
            }
        });

        await Promise.allSettled(sendPromises);

    });

    await Promise.all(promises);

};

export const synchronizeFloorPrice = async (discordClient: Client, openseaClient: OpenSeaClient) => {

    const slugSubscriptions = await connection.getRepository(SlugSubscription).find({
        isActive: true
    });

    console.log(`Found ${slugSubscriptions.length} slug subscriptions`);

    const similarSlugs = new Map();

    const promises = slugSubscriptions.map(async (slugSubscription) => {
       
        const slug = slugSubscription.slug;
        const channelId = slugSubscription.discordChannelId;
        const channel = discordClient.channels.cache.get(channelId) as VoiceChannel;
        
        if (!channel) return;

        console.log(`Channel found for subscription #${slugSubscription.id}`);

        const similarSlug = similarSlugs.get(slug);
        const slugStats = similarSlug || await openseaClient.getSlugStats(slug);

        if (!slugStats) {
            console.log(`No stats found for ${slug}...`);
        };

        const slugName = slugStats.name;
        const floorPrice = slugStats.stats.floor_price.toFixed(2);
        console.log(`Slug: ${slugName} Floor Price num: ${floorPrice}`);

        if (!similarSlug) {
            similarSlugs.set(slug, {
                ...slugStats,
                slug
            });
        }

        await channel.setName(`${floorPrice} Ξ | ${slugName}`);

    });

    await Promise.all(promises);

    const createdAt = new Date();
    Array.from(similarSlugs.values()).forEach((entry) => {
        if (!entry) return;
        console.log({
            slug: entry.slug,
            createdAt,
            value: entry.stats.floor_price
        })
        connection.getRepository(FloorPriceHistory).insert({
            slug: entry.slug,
            createdAt,
            value: entry.stats.floor_price
        });
    });

};
