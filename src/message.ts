import * as fs from "fs";
import path from "path";
import { explainMessage, explainTerm, explainTitle, LookupResult } from "./lookup";
import { formatResult } from "./format";

const PUBLIC_EMOJI = "📖";
const PRIVATE_EMOJIS = ["🔎", "🔍"];
const ANSWER_TTL = 24 * 60 * 60 * 1000;

// Set once the Tool Hub sends replyTo as a real quoted reply; until then the reply quotes the post in its text
const hubQuoteReplies = process.env.HUB_QUOTE_REPLIES === "true";

// Messages already explained, so several people reacting to one message only gets one reply.
// Saved to disk so a restart doesn't forget them.
const answeredPath = path.join(process.env.DATA_DIR ?? path.resolve(__dirname, ".."), "answered.json");
const answered = new Map<string, number>(loadAnswered());

function loadAnswered(): [string, number][] {
    try {
        return Object.entries(JSON.parse(fs.readFileSync(answeredPath, "utf8")));
    }
    catch {
        return [];
    }
}

function saveAnswered() {
    fs.writeFileSync(answeredPath, JSON.stringify(Object.fromEntries(answered)));
}

function claim(key: string) {
    const now = Date.now();
    answered.forEach((time, existingKey) => {
        if (now - time > ANSWER_TTL) answered.delete(existingKey);
    });

    if (answered.has(key)) return false;

    // claimed before the lookup starts, so reactions arriving at the same moment are also ignored
    answered.set(key, now);
    saveAnswered();
    return true;
}

function release(key: string) {
    answered.delete(key);
    saveAnswered();
}

export type RecentLookup = { time: string, roomId: string, trigger: string, kind: string, reply: string };
export const recentLookups: RecentLookup[] = [];

// Reply bodies include the quoted message as "> " lines before the actual reply
const stripQuote = (body: string) => body
    .split("\n")
    .filter(line => !line.trim().startsWith(">"))
    .join("\n")
    .trim();

// A short quote of the post being explained, so the reply makes sense further down the chat
function quoteLine(body: string) {
    const text = stripQuote(body).replace(/\s+/g, " ");
    return `Re: "${text.length > 60 ? text.slice(0, 60).replace(/\s+\S*$/, "") + "…" : text}"`;
}

type ReplyOptions = {
    recipient?: string;  // send privately to this user
    replyTo?: string;    // event id of the message this answers, for the Tool Hub to quote-reply to
    quote?: string;      // body of the post being explained
};

function respond(event, trigger: string, result: LookupResult, { recipient, replyTo, quote }: ReplyOptions = {}) {
    const response: { message: string, context: object, recipient?: string, replyTo?: string } = formatResult(result);
    if (recipient) response.recipient = recipient;
    if (replyTo) response.replyTo = replyTo;
    if (quote && !hubQuoteReplies) response.message = `${quoteLine(quote)}\n${response.message}`;

    recentLookups.unshift({ time: new Date().toISOString(), roomId: event.room_id, trigger, kind: result.kind, reply: response.message });
    recentLookups.splice(20);

    return response;
}

const failure = (recipient?: string) => ({
    message: "📖 Sorry, I couldn't reach Wikipedia just now. Try again in a moment.",
    context: {},
    ...(recipient ? { recipient } : {})
});

const handleReaction = async (event, botUserId) => {
    const emoji: string = event.content?.["m.relates_to"]?.key ?? "";
    const isPrivate = PRIVATE_EMOJIS.some(privateEmoji => emoji.includes(privateEmoji));

    if (!isPrivate && !emoji.includes(PUBLIC_EMOJI)) return;

    const target = event.prevEvent;
    if (!target || target.type !== "m.room.message" || !target.content?.body) return;
    if (target.sender === botUserId) return;

    const recipient = isPrivate ? event.sender : undefined;
    const key = isPrivate ? `${event.room_id}:${target.event_id}:${event.sender}` : `${event.room_id}:${target.event_id}`;

    if (!claim(key)) return;

    try {
        const { result } = await explainMessage(target.content.body);
        return respond(event, `${emoji} reaction`, result, { recipient, replyTo: target.event_id, quote: target.content.body });
    }
    catch (err) {
        console.log(err);
        release(key);
        return failure(recipient);
    }
};

const handleMessage = async (event, botUserId) => {
    const body: string = event.content?.body ?? "";
    const text = stripQuote(body);
    const prevEvent = event.prevEvent;

    try {
        // reply to one of our numbered lists
        const listedOptions: string[] = prevEvent?.sender === botUserId ? prevEvent.content?.context?.wikipediaOptions : undefined;
        if (listedOptions && /^\d+$/.test(text)) {
            const title = listedOptions[Number(text) - 1];
            if (!title) return;

            return respond(event, `reply ${text}`, await explainTitle(title), { replyTo: event.event_id });
        }

        if (!/^!wiki\b/i.test(text)) return;

        const term = text.replace(/^!wiki\b/i, "").trim();
        if (term)
            return respond(event, `!wiki ${term}`, await explainTerm(term), { replyTo: event.event_id });

        // "!wiki" on its own, as a reply to someone's message
        if (prevEvent?.content?.body && prevEvent.sender !== botUserId) {
            if (!claim(`${event.room_id}:${prevEvent.event_id}`)) return;

            const { result } = await explainMessage(prevEvent.content.body);
            return respond(event, "!wiki reply", result, { replyTo: prevEvent.event_id, quote: prevEvent.content.body });
        }

        return {
            message: `📖 React ${PUBLIC_EMOJI} to a message to get a short Wikipedia explanation of what it mentions, or ${PRIVATE_EMOJIS[0]} to get it privately. You can also send "!wiki" followed by a term.`,
            context: {}
        };
    }
    catch (err) {
        console.log(err);
        return failure();
    }
};

const handleEvent = async (event, botUserId) => {
    if (event.type === "m.reaction")
        return handleReaction(event, botUserId);

    if (event.type === "m.room.message")
        return handleMessage(event, botUserId);
};

export default handleEvent;
