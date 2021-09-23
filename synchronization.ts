import { SlugSubscription } from "./database";
import type OpenSeaClient from "./opensea";
import type { Client, VoiceChannel } from "discord.js";

export const synchronize = async (discordClient: Client, openseaClient: OpenSeaClient) => {

    const slugSubscriptions = await SlugSubscription.findAll({
        where: {
            isActive: true
        }
    });

    const similarSlugs = new Map();

    const promises = slugSubscriptions.map(async (slugSubscription) => {
       
        const slug = slugSubscription.slug;
        const channelId = slugSubscription.discordChannelId;
        const channel = discordClient.channels.cache.get(channelId) as VoiceChannel;

        if (!channel) return;

        const similarSlug = similarSlugs.get(slug);
        const { error, slugExists, floorPrice } = similarSlug || await openseaClient.getFloorPrice(slug);

        if (error || !slugExists) return;

        if (!similarSlug) {
            similarSlugs.set(slug, { error, slugExists, floorPrice });
        }

        await channel.setName(`${floorPrice} ETH | ${openseaClient.formatSlugName(slug)}`);

    });

    return await Promise.all(promises);

};
