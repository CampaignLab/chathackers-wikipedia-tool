import { LookupResult } from "./lookup";
import { PageInfo } from "./wikipedia";

// Keeps the first one or two sentences, so the reply stays chat-sized
export function shortExtract(extract: string, maxSentences = 2, maxLength = 320) {
    // a sentence ends at . ! or ? followed by a space and a capital, so "i.e., without" stays in one piece
    const sentences = extract.split(/(?<=[.!?])\s+(?=[\p{Lu}\p{N}"“(])/u);
    let summary = "";

    for (const sentence of sentences.slice(0, maxSentences)) {
        if (summary && (summary + " " + sentence).length > maxLength) break;
        summary += (summary ? " " : "") + sentence;
    }

    summary = summary.trim();

    if (summary.length > maxLength)
        summary = summary.slice(0, maxLength).replace(/\s+\S*$/, "") + "…";

    return summary;
}

const numbered = (pages: PageInfo[]) => pages
    .map((page, i) => `${i + 1}. ${page.title}${page.description ? `: ${page.description}` : ""}`)
    .join("\n");

const options = (pages: PageInfo[]) => ({ wikipediaOptions: pages.map(page => page.title) });

// "Instant-runoff voting (alternative vote)", so people can see which part of the message it explains
const titleWithMention = (page: { title: string, mentionedAs?: string }) =>
    page.mentionedAs ? `${page.title} (${page.mentionedAs})` : page.title;

export function formatResult(result: LookupResult) {
    if (result.kind === "match") {
        const { summary, others } = result;
        let message = `📖 ${titleWithMention(summary)}\n${shortExtract(summary.extract)}\n${summary.url}`;

        if (others.length > 0)
            message += `\n\nAlso mentioned, reply with a number to look one up:\n${others.map((page, i) => `${i + 1}. ${titleWithMention(page)}`).join("\n")}`;

        return { message, context: options(others) };
    }

    if (result.kind === "ambiguous") {
        let message = `📖 "${result.term}" could mean a few things. Reply to this message with a number:\n${numbered(result.options)}`;

        if (result.disambiguationUrl)
            message += `\nAll meanings: ${result.disambiguationUrl}`;

        return { message, context: options(result.options) };
    }

    if (result.kind === "closest") {
        return {
            message: `📖 There's no article called "${result.term}". The closest matches are below, reply with a number to see one:\n${numbered(result.options)}`,
            context: options(result.options)
        };
    }

    if (result.kind === "suggestions") {
        return {
            message: `📖 Nothing in that message clearly matched a Wikipedia article. Did you mean one of these? Reply with a number:\n${numbered(result.options)}`,
            context: options(result.options)
        };
    }

    if (result.term)
        return { message: `📖 I couldn't find a Wikipedia article for "${result.term}".`, context: {} };

    return {
        message: `📖 I couldn't find a Wikipedia article that clearly matches anything in that message. Reply to it with !wiki and the term you're after, for example "!wiki gerrymandering".`,
        context: {}
    };
}
