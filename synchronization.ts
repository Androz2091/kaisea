import { connection, FloorPriceHistory, SlugSubscription } from "./database";
import type OpenSeaClient from "./opensea";
import type { Client, VoiceChannel } from "discord.js";

export const synchronize = async (discordClient: Client, openseaClient: OpenSeaClient) => {

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

    const createdAt = new Date();
    console.log(`Saving ${Array.from(similarSlugs.entries()).length} floor price history entries`);
    Array.from(similarSlugs.entries()).forEach((entry) => {
        const { error, slugExists, floorPriceNum } = entry[1];
        if (error || !slugExists) return;
        connection.getRepository(FloorPriceHistory).insert({
            slug: entry[0],
            createdAt,
            value: floorPriceNum
        });
    });

    return await Promise.all(promises);

};
