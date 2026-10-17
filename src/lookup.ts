import { extractCandidates, Candidate } from "./terms";
import { lookupTitles, searchPages, getLinkedPages, getSummary, PageInfo, Summary } from "./wikipedia";

export type FoundCandidate = Candidate & { page?: PageInfo };

export type LookupResult =
    | { kind: "match", term: string, summary: Summary, others: PageInfo[] }
    | { kind: "ambiguous", term: string, options: PageInfo[], disambiguationUrl?: string, others: PageInfo[] }
    | { kind: "closest", term: string, options: PageInfo[] }
    | { kind: "none", term?: string };

const MAX_OPTIONS = 4;

const overlaps = (a: string, b: string) => {
    const x = a.toLowerCase();
    const y = b.toLowerCase();
    return x.includes(y) || y.includes(x);
};

// For an ambiguous term, the likeliest meanings listed on its disambiguation page
async function disambiguationOptions(term: string, disambiguationTitle: string) {
    const linked = await getLinkedPages(disambiguationTitle);
    const meanings = linked.pages.filter(page => !page.disambiguation);

    // Small pages (often acronyms, whose meanings don't contain the term): list the most read meanings
    if (linked.complete && meanings.length <= 50 && meanings.every(page => page.views !== undefined))
        return meanings
            .sort((a, b) => b.views - a.views)
            .slice(0, MAX_OPTIONS);

    // Big pages: search ranks relevance well, so keep the search hits that the page lists as meanings
    const linkedTitles = new Set(meanings.map(page => page.title));
    const words = term.toLowerCase().split(/\s+/);
    const searchHits = (await searchPages(term, 20)).filter(page => !page.disambiguation);

    const listed = searchHits.filter(page => linkedTitles.has(page.title));
    const titled = searchHits.filter(page => words.every(word => page.title.toLowerCase().includes(word)));

    return (listed.length > 0 ? listed : titled).slice(0, MAX_OPTIONS);
}

async function resultForPage(term: string, page: PageInfo, others: PageInfo[] = []): Promise<LookupResult> {
    if (page.disambiguation) {
        const options = await disambiguationOptions(term, page.title);

        if (options.length === 0)
            return { kind: "none", term };

        return { kind: "ambiguous", term, options, disambiguationUrl: page.url, others };
    }

    return { kind: "match", term, summary: await getSummary(page.title), others };
}

// Explains the most relevant term in a chat message. Only exact article titles (and their redirects) count,
// so the bot says it found nothing rather than picking a loosely related article.
export async function explainMessage(text: string) {
    const candidates = extractCandidates(text);
    const pages = await lookupTitles(candidates.map(candidate => candidate.term));

    const found: FoundCandidate[] = candidates
        .map(candidate => ({ ...candidate, page: pages.get(candidate.term) }))
        // a lone ordinary word that lands on a disambiguation page is just an everyday word
        .filter(candidate => candidate.page && !(candidate.tier === "word" && candidate.page.disambiguation));

    const debug = candidates.map(candidate => ({ ...candidate, page: pages.get(candidate.term) }));

    if (found.length === 0)
        return { result: { kind: "none" } as LookupResult, candidates: debug };

    const [chosen, ...rest] = found;

    // Other distinct things the message mentions, offered as follow-ups
    const others: PageInfo[] = [];
    const usedTerms = [chosen.term];
    rest.forEach(candidate => {
        if (others.length >= MAX_OPTIONS) return;
        if (candidate.page.disambiguation || candidate.tier === "word") return;
        if (usedTerms.some(term => overlaps(term, candidate.term))) return;
        if (candidate.page.title === chosen.page.title || others.some(page => page.title === candidate.page.title)) return;

        usedTerms.push(candidate.term);
        others.push(candidate.page);
    });

    return { result: await resultForPage(chosen.term, chosen.page, others), candidates: debug };
}

const titleCase = (text: string) => text.replace(/\b\p{L}/gu, letter => letter.toUpperCase());

// Explains a term someone typed explicitly. Falls back to search, but presents the hits as options, not answers.
export async function explainTerm(term: string): Promise<LookupResult> {
    const variants = [...new Set([term, titleCase(term)])];
    const pages = await lookupTitles(variants);
    const page = variants.map(variant => pages.get(variant)).find(Boolean);

    if (page)
        return resultForPage(term, page);

    const options = (await searchPages(term, 5, true))
        .filter(option => !option.disambiguation)
        .slice(0, MAX_OPTIONS);

    if (options.length === 0)
        return { kind: "none", term };

    return { kind: "closest", term, options };
}

export async function explainTitle(title: string): Promise<LookupResult> {
    const summary = await getSummary(title);

    if (summary.disambiguation)
        return explainTerm(title);

    return { kind: "match", term: title, summary, others: [] };
}
