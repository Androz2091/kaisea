import { connection, FloorPriceHistory, NotificationSubscription, SlugSubscription } from "./database";
import type OpenSeaClient from "./opensea";
import { Client, MessageEmbed, TextChannel, VoiceChannel } from "discord.js";

export const synchronizeEvents = async (discordClient: Client, openseaClient: OpenSeaClient) => {

    const notificationSubscriptions = await connection.getRepository(NotificationSubscription).find({
        isActive: true
    });

    console.log(`Found ${notificationSubscriptions.length} notification subscriptions`);

    const promises = notificationSubscriptions.map(async (notificationSubscription) => {
        
        const slug = notificationSubscription.slug;
        const type = notificationSubscription.type as 'created' | 'successfull';
        const lastSync = new Date(notificationSubscription.lastSyncAt).getTime();
        const channelId = notificationSubscription.discordChannelId;
        const channel = discordClient.channels.cache.get(channelId) as TextChannel;
        
        if (!channel) return;

        console.log(`Channel found for notif subscription #${notificationSubscription.id}`);

        const { events } = await openseaClient.getCollectionEvents(slug, type, lastSync);

        const sendPromises: Promise<void>[] = [];
        events.forEach((event) => {
            let eventData = event as any;
            if (type === 'created') {
                const url = `https://opensea.io/assets/${eventData.asset.asset_contract.address}/${eventData.asset.token_id}`;
                const embed = new MessageEmbed()
                    .setTitle(`${eventData.asset.name} has been listed !`)
                    .setURL(url)
                    .setThumbnail(eventData.asset.collection.banner_image_url)
                    .addField('Name', eventData.asset.name)
                    //.addField('Price', eventData.asset.)
                    .setFooter('Listed on OpenSea', discordClient.user?.displayAvatarURL())
                    .setColor('DARK_AQUA');
                sendPromises.push(new Promise((resolve) => {
                    channel.send({
                        embeds: [embed]
                    }).finally(() => resolve());
                }));
            } else if (type === 'successfull') {
                const embed = new MessageEmbed()
                    .setTitle(`${eventData.asset.name} has been sold !`)
                    .setThumbnail(eventData.asset.collection.banner_image_url)
                    .addField('Name', eventData.asset.name)
                    .setFooter('Sold on OpenSea', discordClient.user?.displayAvatarURL())
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

    await connection.getRepository(NotificationSubscription).update({
        isActive: true
    }, {
        lastSyncAt: new Date()
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
        const { error, slugExists, floorPrice, floorPriceNum } = similarSlug || await openseaClient.getSlugStats(slug);

        console.log(`Slug exists: ${slugExists}; Floor Price num: ${floorPrice}`);

        if (error || !slugExists) return;

        if (!similarSlug) {
            similarSlugs.set(slug, { error, slugExists, floorPrice, floorPriceNum });
        }

        await channel.setName(`${floorPrice} Ξ | ${openseaClient.formatSlugName(slug)}`);

    });

    await Promise.all(promises);

    const createdAt = new Date();
    Array.from(similarSlugs.values()).forEach((entry) => {
        const { error, slugExists, floorPriceNum } = entry;
        if (error || !slugExists) return;
        connection.getRepository(FloorPriceHistory).insert({
            slug: entry,
            createdAt,
            value: floorPriceNum
        });
    });

};
