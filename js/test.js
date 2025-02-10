const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const { parse: Builder } = require("xml2js");
const { URL } = require("url");
const robotsParser = require("robots-parser");
const fs = require("fs");
const path = require("path");
const winston = require("winston");

const app = express();
app.use(express.json());

// Logger setup (logs to `app.log`)
const logger = winston.createLogger({
    level: "info",
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => 
            `${timestamp} [${level.toUpperCase()}]: ${message}`
        )
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: "app.log" })
    ]
});

const TIMEOUT = 10000;
const MAX_PAGES_LIMIT = 500;
const CRAWL_DELAY = 2000; // 2 seconds delay between requests

/**
 * Checks robots.txt for crawl permissions and delay.
 */
async function checkRobotsTxt(baseUrl) {
    try {
        const robotsUrl = new URL("/robots.txt", baseUrl).href;
        const response = await axios.get(robotsUrl, { timeout: TIMEOUT });
        const robots = robotsParser(robotsUrl, response.data);
        const canFetch = robots.isAllowed(baseUrl, "*");
        const crawlDelay = robots.getCrawlDelay("*") || CRAWL_DELAY;
        return { canFetch, crawlDelay };
    } catch (err) {
        return { canFetch: true, crawlDelay: CRAWL_DELAY }; // Default if no robots.txt
    }
}

/**
 * Checks if a URL is a valid internal link.
 */
function isValidInternalLink(baseUrl, href, domain) {
    try {
        const absoluteUrl = new URL(href, baseUrl);

        // 🛑 Ignore section fragments but allow JS-powered routes (#/)
        if (absoluteUrl.hash && !absoluteUrl.hash.startsWith("#/")) {
            return false;
        }

        return absoluteUrl.hostname === domain &&
               absoluteUrl.protocol.startsWith("http");
    } catch (err) {
        return false;
    }
}

/**
 * Crawls internal links of a given URL.
 */
async function getInternalLinks(startUrl, maxPages) {
    const visited = new Set();
    const toVisit = [startUrl];
    const baseDomain = new URL(startUrl).hostname;

    while (toVisit.length > 0 && visited.size < maxPages) {
        const url = toVisit.shift();
        if (visited.has(url)) continue;

        logger.info(`Fetching: ${url}`);
        try {
            const response = await axios.get(url, { timeout: TIMEOUT, headers: { "User-Agent": "SitemapGenerator/1.0" } });

            if (!response.headers["content-type"]?.includes("text/html")) continue;

            visited.add(url);
            const $ = cheerio.load(response.data);

            $("a[href]").each((_, elem) => {
                const href = $(elem).attr("href");
                if (!href) return;

                const fullUrl = new URL(href, url).href;
                if (isValidInternalLink(startUrl, fullUrl, baseDomain) && !visited.has(fullUrl) && !toVisit.includes(fullUrl)) {
                    toVisit.push(fullUrl);
                }
            });

            logger.info(`Crawled: ${url} (${visited.size}/${maxPages})`);
            await new Promise(resolve => setTimeout(resolve, CRAWL_DELAY));
        } catch (err) {
            logger.warn(`Failed to fetch: ${url} - ${err.message}`);
        }
    }
    
    return Array.from(visited);
}

/**
 * Generates an XML sitemap from collected URLs.
 */
function generateSitemapXml(urls) {
    const builder = new Builder();
    const sitemap = {
        urlset: {
            $: { xmlns: "http://www.sitemaps.org/schemas/sitemap/0.9" },
            url: urls.map(loc => ({ loc }))
        }
    };
    return builder.buildObject(sitemap);
}

/**
 * API Route: Generate Sitemap
 */
app.post("/generate-sitemap", async (req, res) => {
    const { url, max_pages = 100 } = req.body;

    if (!url) return res.status(400).json({ error: "URL is required" });
    if (max_pages > MAX_PAGES_LIMIT) return res.status(400).json({ error: `max_pages cannot exceed ${MAX_PAGES_LIMIT}` });

    logger.info(`Sitemap generation requested for: ${url} with max_pages=${max_pages}`);

    try {
        const { canFetch, crawlDelay } = await checkRobotsTxt(url);
        if (!canFetch) return res.status(403).json({ error: "Crawling is disallowed by robots.txt" });

        const links = await getInternalLinks(url, max_pages);
        if (links.length === 0) return res.status(404).json({ error: "No valid pages found" });

        const sitemapXml = generateSitemapXml(links);
        const fileName = `sitemap_${new URL(url).hostname.replace(/\./g, "_")}.xml`;
        const filePath = path.join(__dirname, "sitemaps", fileName);

        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, sitemapXml);

        logger.info(`Sitemap created: ${filePath} with ${links.length} URLs`);
        res.json({ message: "Sitemap generated", file: filePath, url_count: links.length, crawl_delay_used: crawlDelay });
    } catch (err) {
        logger.error(`Error generating sitemap: ${err.message}`);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

/**
 * Root Route
 */
app.get("/", (req, res) => {
    res.json({
        message: "Sitemap Generator API",
        endpoints: {
            generate_sitemap: "/generate-sitemap",
            documentation: "/docs"
        }
    });
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    logger.info(`🚀 Server running on http://localhost:${PORT}`);
});
