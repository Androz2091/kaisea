import fetch from 'node-fetch';
import { pRateLimit } from 'p-ratelimit';

const limit = pRateLimit({
    interval: 200, 
    rate: 1,
    concurrency: 2,
    maxDelay: 15_000
});

export default class OpenSeaClient {

    constructor () {
    }

    getSlugStats (slug: string): Promise<any> {
        return limit(() => fetch(`https://api.opensea.io/collection/${slug}`).then((res) => {
            return res.json().then((data) => {
                return data?.collection ?? 0;
            });
        }));
    }

    async getCollectionEvents (slug: string, eventType: 'created' | 'successful', occurredAfter?: number): Promise<{
        slugExists: boolean;
        events: unknown[];
    }> {
        const query = new URLSearchParams();
        query.set('collection_slug', slug);
        query.set('event_type', eventType);
        if (occurredAfter) query.set('occurred_after', occurredAfter.toString());
        query.set('only_opensea', 'false');
        const response = await (await fetch(`https://api.opensea.io/api/v1/events?${query}`)).json();
        console.log(response);
        return {
            slugExists: Object.prototype.hasOwnProperty.call(response, 'asset_events'),
            events: response.asset_events
        };
    }

    formatSlugName (slug: string): string {
        return slug.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
    }

}
