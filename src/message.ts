import { explainMessage, explainTerm, explainTitle, LookupResult } from "./lookup";
import { formatResult } from "./format";

const PUBLIC_EMOJI = "📖";
const PRIVATE_EMOJIS = ["🔎", "🔍"];
const ANSWER_TTL = 24 * 60 * 60 * 1000;

// Messages already explained, so several people reacting to one message only gets one reply.
// In memory only: a restart forgets them, which is fine for a prototype.
const answered = new Map<string, number>();

function claim(key: string) {
    const now = Date.now();
    answered.forEach((time, existingKey) => {
        if (now - time > ANSWER_TTL) answered.delete(existingKey);
    });

    if (answered.has(key)) return false;

    // claimed before the lookup starts, so reactions arriving at the same moment are also ignored
    answered.set(key, now);
    return true;
}

export type RecentLookup = { time: string, roomId: string, trigger: string, kind: string, reply: string };
export const recentLookups: RecentLookup[] = [];

function respond(event, trigger: string, result: LookupResult, recipient?: string) {
    const response: { message: string, context: object, recipient?: string } = formatResult(result);
    if (recipient) response.recipient = recipient;

    recentLookups.unshift({ time: new Date().toISOString(), roomId: event.room_id, trigger, kind: result.kind, reply: response.message });
    recentLookups.splice(20);

    return response;
}

const failure = (recipient?: string) => ({
    message: "📖 Sorry, I couldn't reach Wikipedia just now. Try again in a moment.",
    context: {},
    ...(recipient ? { recipient } : {})
});

// Reply bodies include the quoted message as "> " lines before the actual reply
const stripQuote = (body: string) => body
    .split("\n")
    .filter(line => !line.trim().startsWith(">"))
    .join("\n")
    .trim();

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
        return respond(event, `${emoji} reaction`, result, recipient);
    }
    catch (err) {
        console.log(err);
        answered.delete(key);
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

            return respond(event, `reply ${text}`, await explainTitle(title));
        }

        if (!/^!wiki\b/i.test(text)) return;

        const term = text.replace(/^!wiki\b/i, "").trim();
        if (term)
            return respond(event, `!wiki ${term}`, await explainTerm(term));

        // "!wiki" on its own, as a reply to someone's message
        if (prevEvent?.content?.body && prevEvent.sender !== botUserId) {
            if (!claim(`${event.room_id}:${prevEvent.event_id}`)) return;

            const { result } = await explainMessage(prevEvent.content.body);
            return respond(event, "!wiki reply", result);
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
