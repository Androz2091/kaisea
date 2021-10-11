import fetch from 'node-fetch';
import type { Browser } from 'puppeteer';
import puppeteer from 'puppeteer-extra';

import StealthPlugin from 'puppeteer-extra-plugin-stealth';
puppeteer.use(StealthPlugin());

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms)); 

export default class OpenSeaClient {

    public _waitForBrowser: Promise<void | null>;
    public browser: Browser|null;

    constructor () {
        this.browser = null;
        this._waitForBrowser = puppeteer.launch({
            headless: true,
        }).then((browser) => {
            console.log('Launched Chromium!');
            this.browser = browser;
        });
        console.log('Launching Chromium...');
    }

    async getSlugStats (slug: string): Promise<{
        floorPrice?: string;
        floorPriceNum?: number;
        itemCount?: string;
        ownerCount?: string;
        volumeTraded?: string;
        slugExists?: boolean;
        iconImageURL?: string;
        bannerImageURL?: string;
        error?: string;
    }> {
        await this._waitForBrowser;
        if (!this.browser) return { error: 'Something when wrong with Chromium.' };

        const page = await this.browser.newPage();
        const waitForFloorPrice = page.waitForSelector('.fqMVjm', {
            timeout: 10000
        });
        await page.goto(`https://opensea.io/collection/${slug}`);
        const waitForFloorPriceSuccess = await waitForFloorPrice.catch(() => {});
        await sleep(500);
        if (!waitForFloorPriceSuccess) {
            await page.close();
            return { slugExists: false }
        }

        const parseContent = (content: string): null|{ formatted: string; num: number; } => {
            const updatedContent = content.includes('<') ? content.slice(2, content.length) : content;
            if (isNaN(parseFloat(updatedContent))) return null;
            const parsedContent = updatedContent.includes('K') ? parseFloat(updatedContent) * 1000 : parseFloat(updatedContent);
            return {
                formatted: parsedContent.toLocaleString(),
                num: parseFloat(updatedContent)
            };
        }

        let itemCountElement;
        let itemCountContent;
        let ownerCount;
        let ownerContent;
        let floorPriceElement;
        let floorPriceContent;
        let volumeTradedElement;
        let volumeTradedContent;
        let bannerImageElement;
        let bannerImageURL;
        let iconImageElement;
        let iconImageURL;

        try {
            itemCountElement = (await page.$$('.fqMVjm'))[0];
            itemCountContent = await itemCountElement.evaluate((el) => el.textContent) as string;
            ownerCount = (await page.$$('.fqMVjm'))[1];
            ownerContent = await ownerCount.evaluate((el) => el.textContent) as string;
            floorPriceElement = (await page.$$('.fqMVjm'))[2];
            floorPriceContent = await floorPriceElement.evaluate((el) => el.textContent) as string;
            volumeTradedElement = (await page.$$('.fqMVjm'))[3];
            volumeTradedContent = await volumeTradedElement.evaluate((el) => el.textContent) as string;
            bannerImageElement = (await page.$$('.Image--image'))[0];
            bannerImageURL = await bannerImageElement.evaluate((el) => el.getAttribute('src')) as string;
            iconImageElement = (await page.$$('.Image--image'))[1];
            iconImageURL = await iconImageElement.evaluate((el) => el.getAttribute('src')) as string;
        } catch (e) {
            console.error('Something went wrong when evaluating');
            page.close();
            return { error: 'Something went wrong when evaluating' };
        }

        if (
            !parseContent(itemCountContent)
            || !parseContent(ownerContent)
            || !parseContent(floorPriceContent)
            || !parseContent(volumeTradedContent)
        ) {
            await page.close();
            return { error: 'Something went wrong with the floor price of this slug. Please retry with a slug that has a valid floor price' };
        }

        await page.close();
        return {
            slugExists: true,
            floorPrice: parseContent(floorPriceContent)?.formatted as string,
            floorPriceNum: parseContent(floorPriceContent)?.num as number,
            itemCount: parseContent(itemCountContent)?.formatted as string,
            ownerCount: parseContent(ownerContent)?.formatted as string,
            volumeTraded: parseContent(volumeTradedContent)?.formatted as string,
            iconImageURL,
            bannerImageURL
        }
    }

    async getCollectionEvents (slug: string, eventType: 'created' | 'successfull', occurredAfter?: number): Promise<{
        slugExists: boolean;
        events: unknown[];
    }> {
        const query = new URLSearchParams();
        query.set('collection_slug', slug);
        query.set('event_type', eventType);
        if (occurredAfter) query.set('occurred_after', occurredAfter.toString());
        console.log(query);
        query.set('only_opensea', 'false');
        const response = await (await fetch(`https://api.opensea.io/api/v1/events${query}`)).json();
        console.log(response);
        return {
            slugExists: response.success,
            events: response.assets_events
        };
    }

    formatSlugName (slug: string): string {
        return slug.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
    }

}
