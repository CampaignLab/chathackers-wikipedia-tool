const API_URL = "https://en.wikipedia.org/w/api.php";
const REST_URL = "https://en.wikipedia.org/api/rest_v1";

// Wikimedia asks every client to identify itself: https://meta.wikimedia.org/wiki/User-Agent_policy
const userAgent = process.env.WIKIPEDIA_USER_AGENT ?? "ChatHackersWikipediaTool/0.1 (https://github.com/Chat-Hackers)";

export type PageInfo = {
    title: string;
    description?: string;
    disambiguation: boolean;
    url: string;
}

export type Summary = PageInfo & {
    extract: string;
}

async function getJson(url: string) {
    const response = await fetch(url, {
        headers: { "User-Agent": userAgent, "Api-User-Agent": userAgent }
    });

    if (!response.ok)
        throw new Error(`Wikipedia request failed (${response.status}): ${url}`);

    return response.json() as Promise<any>;
}

function queryUrl(params: Record<string, string>) {
    const search = new URLSearchParams({
        action: "query",
        format: "json",
        formatversion: "2",
        prop: "pageprops|description|info",
        ppprop: "disambiguation",
        inprop: "url",
        ...params
    });

    return `${API_URL}?${search}`;
}

function toPageInfo(page: any): PageInfo {
    return {
        title: page.title,
        description: page.description,
        disambiguation: page.pageprops?.disambiguation !== undefined,
        url: page.fullurl
    };
}

// Looks up exact titles (following redirects). Returns a map from each term that has an article to that article.
export async function lookupTitles(terms: string[]) {
    const found = new Map<string, PageInfo>();

    // the API accepts at most 50 titles per request
    for (let i = 0; i < terms.length; i += 50) {
        const batch = terms.slice(i, i + 50);
        const result = await getJson(queryUrl({ titles: batch.join("|"), redirects: "1" }));
        const query = result.query ?? {};

        const normalized = new Map<string, string>((query.normalized ?? []).map(n => [n.from, n.to]));
        const redirects = new Map<string, string>((query.redirects ?? []).map(r => [r.from, r.to]));
        const pages = new Map<string, any>((query.pages ?? []).map(p => [p.title, p]));

        batch.forEach(term => {
            const normalizedTitle = normalized.get(term) ?? term;
            const title = redirects.get(normalizedTitle) ?? normalizedTitle;
            const page = pages.get(title);

            if (page && !page.missing && !page.invalid)
                found.set(term, toPageInfo(page));
        });
    }

    return found;
}

// Wikipedia's "did you mean" for a misspelt search, if it has one
async function spellingSuggestion(text: string): Promise<string | undefined> {
    const search = new URLSearchParams({ action: "query", format: "json", formatversion: "2", list: "search", srsearch: text, srinfo: "suggestion", srlimit: "1" });
    const result = await getJson(`${API_URL}?${search}`);

    return result.query?.searchinfo?.suggestion;
}

export async function searchPages(text: string, limit = 10, retrySpelling = false) {
    const result = await getJson(queryUrl({
        generator: "search",
        gsrsearch: text,
        gsrlimit: String(limit)
    }));

    const pages: any[] = result.query?.pages ?? [];

    if (pages.length === 0 && retrySpelling) {
        const suggestion = await spellingSuggestion(text);
        if (suggestion) return searchPages(suggestion, limit);
    }

    return pages
        .sort((a, b) => a.index - b.index)
        .map(toPageInfo);
}

// The articles a disambiguation page links to, with recent page views where the API returns them
export async function getLinkedPages(title: string) {
    const result = await getJson(queryUrl({
        titles: title,
        generator: "links",
        gplnamespace: "0",
        gpllimit: "max",
        prop: "pageprops|description|info|pageviews",
        pvipdays: "30"
    }));

    const pages: any[] = (result.query?.pages ?? []).filter(page => !page.missing && !page.invalid);

    return {
        pages: pages.map(page => ({
            ...toPageInfo(page),
            views: page.pageviews ? Object.values(page.pageviews).reduce((sum: number, views) => sum + (Number(views) || 0), 0) as number : undefined
        })),
        complete: !result.continue
    };
}

export async function getSummary(title: string): Promise<Summary> {
    const result = await getJson(`${REST_URL}/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`);

    return {
        title: result.title,
        description: result.description,
        disambiguation: result.type === "disambiguation",
        url: result.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(result.title)}`,
        extract: result.extract ?? ""
    };
}
