import fetch from 'node-fetch';
import type { Browser } from 'puppeteer';
import puppeteer from 'puppeteer-extra';
import PluginStealth from 'puppeteer-extra-plugin-stealth';

puppeteer.use(PluginStealth());

export default class OpenSeaClient {


    public _browser: null|Browser;

    constructor () {
        this._browser = null;
        puppeteer.launch({
            headless: true
        }).then((browser) => {
            console.log('Chrome launched!');
            this._browser = browser;
        });

        setInterval(async () => {
            const pages = await this._browser?.pages() || [];
            for (let page of pages) {
                const closed = await page.isClosed();
                await page.close();
                if (!closed) console.log(`Closed page!`);
            }
        }, 50*60_000);
    }

    getSlugStats (slug: string): Promise<any> {
        return fetch(`https://api.opensea.io/collection/${slug}`, {
            headers: {
                'X-API-KEY': process.env.OPENSEA_API_KEY!
            }
        }).then((res) => {
            return res.json().then((data) => {
                return data?.collection ?? 0;
            });
        });
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
        const response = await (await fetch(`https://api.opensea.io/api/v1/events?${query}`, {
            headers: {
                'X-API-KEY': process.env.OPENSEA_API_KEY!
            }
        })).json();
        console.log(query.toString(), response);
        return {
            slugExists: Object.prototype.hasOwnProperty.call(response, 'asset_events'),
            events: response.asset_events
        };
    }

    async getBuynowItems (slug: string): Promise<number> {
        const page = await this._browser!.newPage();
        await page.goto(`https://opensea.io/collection/${slug}?search[sortAscending]=true&search[sortBy]=PRICE&search[toggles][0]=BUY_NOW`);
        await page.waitForTimeout(5);
        const itemCountElement = (await page.$$('.AssetSearchView--results-count'))[0];
        const itemCountContent = await itemCountElement.evaluate((el) => el.textContent) as string;
        return parseInt(itemCountContent.replace(/[^0-9.]/g, ''));
    }

    formatSlugName (slug: string): string {
        return slug.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
    }

}
