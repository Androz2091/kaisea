import type { Browser } from 'puppeteer';
import puppeteer from 'puppeteer-extra';

import StealthPlugin from 'puppeteer-extra-plugin-stealth';
puppeteer.use(StealthPlugin());

export default class OpenSeaClient {

    public _waitForBrowser: Promise<null>;
    public resolveLaunchPromise: (value: PromiseLike<null> | null) => void = () => {};
    public browser: Browser|null;

    constructor () {
        this.browser = null;
        this._waitForBrowser = new Promise((resolve) => {
            this.resolveLaunchPromise = resolve;
        });
        puppeteer.launch({
            headless: false
        }).then((browser) => {
            this.browser = browser;
            this.resolveLaunchPromise(null);
        });
    }

    async getFloorPrice (slug: string): Promise<{
        floorPrice?: number,
        slugExists?: boolean,
        error?: string
    }> {
        await this._waitForBrowser;
        if (!this.browser) return { error: 'Something when wrong with Chromium.' };

        const page = await this.browser.newPage();
        const waitForFloorPrice = page.waitForSelector('.fqMVjm', {
            timeout: 5000
        });
        await page.goto(`https://opensea.io/collection/${slug}`);
        const waitForFloorPriceSuccess = await waitForFloorPrice.catch(() => {});
        if (!waitForFloorPriceSuccess) {
            return { slugExists: false }
        }
        const floorPriceElement = (await page.$$('.fqMVjm'))[2];
        const floorPriceContent = await floorPriceElement.evaluate((el) => el.textContent) as string;

        return {
            slugExists: true,
            floorPrice: parseFloat(floorPriceContent)
        }
    }

    formatSlugName (slug: string): string {
        return slug.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
    }

}
