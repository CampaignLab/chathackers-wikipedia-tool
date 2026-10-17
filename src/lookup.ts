import { extractCandidates, extractSuggestionWords, singularise, Candidate } from "./terms";
import { lookupTitles, searchPages, getLinkedPages, getSummary, PageInfo, Summary } from "./wikipedia";

export type FoundCandidate = Candidate & { page?: PageInfo };

// mentionedAs: how the message worded it, when that isn't recognisable in the title ("alternative vote")
export type Mention = PageInfo & { mentionedAs?: string };

export type LookupResult =
    | { kind: "match", term: string, summary: Summary & { mentionedAs?: string }, others: Mention[] }
    | { kind: "ambiguous", term: string, options: PageInfo[], disambiguationUrl?: string, others: PageInfo[] }
    | { kind: "closest", term: string, options: PageInfo[] }
    | { kind: "suggestions", options: PageInfo[] }
    | { kind: "none", term?: string };

const MAX_OPTIONS = 4;

// Two terms overlap if one contains the other, or they share a meaningful word:
// "The German" overlaps "German Social Democratic Party"
const meaningfulWords = (term: string) => term.toLowerCase().split(/\s+/).filter(word => word.length >= 4 && word !== "the");

const overlaps = (a: string, b: string) => {
    const x = a.toLowerCase();
    const y = b.toLowerCase();
    if (x.includes(y) || y.includes(x)) return true;

    const words = meaningfulWords(a);
    return meaningfulWords(b).some(word => words.includes(word));
};

const comparable = (text: string) => text
    .normalize("NFD")
    .replace(/\p{M}/gu, "") // accents: Reykjavik matches Reykjavík
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

// The message's own wording for a term, if the article title doesn't already contain it.
// "alternative vote" -> Instant-runoff voting gets it; "Tower Hamlets" -> London Borough of Tower Hamlets doesn't.
function mentionedAs(title: string, term: string, text: string) {
    const titleText = comparable(title);
    if (titleText.includes(comparable(term)) || titleText.includes(comparable(singularise(term)))) return;

    // the original wording, since terms can be re-cased ("German social Democratic Party")
    const start = text.toLowerCase().indexOf(term.toLowerCase());
    return start >= 0 ? text.slice(start, start + term.length) : term;
}

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

async function resultForPage(term: string, page: PageInfo, text: string, others: Mention[] = []): Promise<LookupResult> {
    if (page.disambiguation) {
        const options = await disambiguationOptions(term, page.title);

        if (options.length === 0)
            return { kind: "none", term };

        return { kind: "ambiguous", term, options, disambiguationUrl: page.url, others };
    }

    const summary = await getSummary(page.title);

    return { kind: "match", term, summary: { ...summary, mentionedAs: mentionedAs(summary.title, term, text) }, others };
}

// Nothing clearly matched, but someone asked about this message, so there's probably a term in it.
// Offer the everyday words that have articles as numbered suggestions rather than picking one.
async function suggestFromEverydayWords(text: string, debug: FoundCandidate[]) {
    const words = extractSuggestionWords(text);
    const pages = await lookupTitles(words);

    const options: PageInfo[] = [];
    words.forEach(word => {
        const page = pages.get(word);
        debug.push({ term: word, prior: 0, tier: "suggestion", page });

        if (!page || page.disambiguation || options.length >= MAX_OPTIONS) return;
        if (options.some(option => option.title === page.title)) return;

        options.push(page);
    });

    const result: LookupResult = options.length > 0 ? { kind: "suggestions", options } : { kind: "none" };

    return { result, candidates: debug };
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

    const debug: FoundCandidate[] = candidates.map(candidate => ({ ...candidate, page: pages.get(candidate.term) }));

    if (found.length === 0)
        return suggestFromEverydayWords(text, debug);

    // An ambiguous name shouldn't win over a clear article for something else the message mentions
    // (single everyday words don't count as clear, or "Mercury … retrograde" would explain Retrograde)
    const clear = found.find(candidate => !candidate.page.disambiguation && candidate.tier !== "word");
    const chosen = clear ?? found[0];
    const rest = found.filter(candidate => candidate !== chosen);

    // Other distinct things the message mentions, offered as follow-ups
    const others: Mention[] = [];
    const usedTerms = [chosen.term];
    rest.forEach(candidate => {
        if (others.length >= MAX_OPTIONS) return;
        if (candidate.page.disambiguation || candidate.tier === "word") return;
        if (usedTerms.some(term => overlaps(term, candidate.term))) return;
        if (candidate.page.title === chosen.page.title || others.some(page => page.title === candidate.page.title)) return;

        usedTerms.push(candidate.term);
        others.push({ ...candidate.page, mentionedAs: mentionedAs(candidate.page.title, candidate.term, text) });
    });

    return { result: await resultForPage(chosen.term, chosen.page, text, others), candidates: debug };
}

const titleCase = (text: string) => text.replace(/\b\p{L}/gu, letter => letter.toUpperCase());

// Explains a term someone typed explicitly. Falls back to search, but presents the hits as options, not answers.
export async function explainTerm(term: string): Promise<LookupResult> {
    const variants = [...new Set([term, titleCase(term)])];
    const pages = await lookupTitles(variants);
    const page = variants.map(variant => pages.get(variant)).find(Boolean);

    if (page)
        return resultForPage(term, page, term);

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
