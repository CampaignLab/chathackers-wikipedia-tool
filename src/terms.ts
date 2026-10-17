// Pulls out the words and phrases in a chat message that might have a Wikipedia article.
// Each candidate gets a prior: how likely it is to be the thing people want explained.
// Higher-prior candidates win when several terms in one message have articles.

export type Candidate = {
    term: string;
    prior: number;
    tier: "quoted" | "name" | "phrase" | "word";
}

// Lowercase words that can sit inside a name: "Bank of England", "Leonardo da Vinci"
const CONNECTORS = new Set(["of", "the", "and", "for", "on", "in", "upon", "de", "du", "da", "di", "la", "le", "von", "van", "der", "&"]);

// Words that never make a useful lookup on their own, whatever their case
const STOPWORDS = new Set(`
a about above after again against all also am an and any are aren't as at be because been before being below
between both but by can can't cannot could couldn't did didn't do does doesn't doing don't down during each
few for from further had hadn't has hasn't have haven't having he he'd he'll he's her here here's hers herself
him himself his how how's i i'd i'll i'm i've if in into is isn't it it's its itself let's me more most mustn't
my myself no nor not of off on once only or other ought our ours ourselves out over own same shan't she she'd
she'll she's should shouldn't so some such than that that's the their theirs them themselves then there
there's these they they'd they'll they're they've this those through to too under until up very was wasn't we
we'd we'll we're we've were weren't what what's when when's where where's which while who who's whom why why's
will with won't would wouldn't you you'd you'll you're you've your yours yourself yourselves
yes yeah yep no nope ok okay hi hello hey thanks thank cheers please lol haha anyone everyone someone anything
everything something nothing just really actually maybe probably think know mean said says say get got going
gonna wanna like well still even though now today tomorrow yesterday tonight morning afternoon evening week
weekend month year time thing things people guys folks good great nice bad sure right left new old next last
one two three need want see look make made take come back way much many lot lots also again already
monday tuesday wednesday thursday friday saturday sunday january february march april may june july august
september october november december
`.trim().split(/\s+/));

// Ordinary long words that have Wikipedia articles but are almost never what someone wants explained
const COMMON_WORDS = new Set(`
about across against agreed already although amazing another anyway around because before better between
brilliant called certainly change changes coming community completely concerned conversation council
definitely different discussed discussion during earlier either enough especially evening everybody
everything exactly example excellent following forward further general generally getting happened happening
honestly however important information instead interested interesting issues looking meeting meetings
message messages minutes morning nothing obviously organise organised otherwise particular people perhaps
planning please possible possibly presumably probably problem problems question questions quickly quite
really reason recently remember seriously several should similar something sometimes somewhere sorted
started still suggest suggested support thanks therefore thinking thought through together tomorrow
tonight totally understand unfortunately update various whatever whether without wonderful working
yesterday
`.trim().split(/\s+/));

const isCapitalised = (word: string) => /^\p{Lu}/u.test(word);
const isAcronym = (word: string) => /^\p{Lu}{2,6}s?$/u.test(word);
const isStopword = (word: string) => STOPWORDS.has(word.toLowerCase());

function cleanMessage(text: string) {
    return text
        .split("\n")
        .filter(line => !line.trim().startsWith(">")) // quoted reply fallback text
        .join("\n")
        .replace(/https?:\/\/\S+/g, " ")
        .replace(/@\S+/g, " ")
        .replace(/!wiki\b/gi, " ");
}

function tokenise(sentence: string) {
    const words = sentence.match(/[\p{L}\p{N}][\p{L}\p{N}'’&-]*/gu) ?? [];

    return words
        .map(word => word.replace(/['’]s$/, "").replace(/[-'’]+$/, ""))
        .filter(word => word.length > 0);
}

// Splits a sentence into runs of capitalised words, letting connectors join two capitalised words
function capitalisedRuns(words: string[]) {
    const runs: { words: string[], start: number, tail: string[] }[] = [];
    let i = 0;

    while (i < words.length) {
        if (!isCapitalised(words[i])) {
            i++;
            continue;
        }

        const run = [words[i]];
        const start = i;
        let k = i + 1;

        while (k < words.length) {
            if (isCapitalised(words[k])) {
                run.push(words[k]);
                k++;
            }
            else if (CONNECTORS.has(words[k])) {
                // up to two connectors in a row: "Friends of the Earth"
                const connectors = CONNECTORS.has(words[k + 1]) ? 2 : 1;
                const next = words[k + connectors];

                if (!next || !isCapitalised(next)) break;

                run.push(...words.slice(k, k + connectors + 1));
                k += connectors + 1;
            }
            else break;
        }

        // a name followed by lowercase words can be one term: "Overton window", "Brexit referendum"
        const tail: string[] = [];
        while (tail.length < 2 && k + tail.length < words.length) {
            const word = words[k + tail.length];
            if (isCapitalised(word) || isStopword(word) || CONNECTORS.has(word)) break;
            tail.push(word);
        }

        runs.push({ words: run, start, tail });
        i = k;
    }

    return runs;
}

function addCandidate(candidates: Map<string, Candidate>, candidate: Candidate) {
    const key = candidate.term.toLowerCase();
    const existing = candidates.get(key);

    if (!existing || existing.prior < candidate.prior)
        candidates.set(key, candidate);
}

// Everyday word forms that match generic articles: "apparently" -> Apparently, "snacks" -> Snack, "running" -> Running.
// Long -ing words are kept because jargon often looks like that ("gerrymandering", "crowdfunding").
function isOrdinaryWord(word: string) {
    const lower = word.toLowerCase();

    return lower.length < 6
        || STOPWORDS.has(lower)
        || COMMON_WORDS.has(lower)
        || /\d/.test(lower)
        || /ly$/.test(lower)
        || /ed$/.test(lower)
        || (/ing$/.test(lower) && lower.length < 10)
        || (/s$/.test(lower) && !/(ss|us|is|ics)$/.test(lower));
}

function addLowercaseWord(candidates: Map<string, Candidate>, word: string) {
    if (!isOrdinaryWord(word))
        addCandidate(candidates, { term: word.toLowerCase(), prior: 10, tier: "word" });
}

export function extractCandidates(text: string, limit = 50): Candidate[] {
    const candidates = new Map<string, Candidate>();
    const cleaned = cleanMessage(text);

    // Anything in double quotes is almost certainly the thing being asked about
    for (const match of cleaned.matchAll(/["“]([^"“”\n]{2,60})["”]/g))
        addCandidate(candidates, { term: match[1].trim(), prior: 100, tier: "quoted" });

    const sentences = cleaned.split(/[.!?;:()\[\]\n]+|\s[-–—]\s/);

    sentences.forEach(sentence => {
        const words = tokenise(sentence);

        // Names: every span of a capitalised run, preferring longer spans
        capitalisedRuns(words).forEach(run => {
            for (let from = 0; from < run.words.length; from++) {
                for (let to = from + 1; to <= Math.min(run.words.length, from + 6); to++) {
                    const span = run.words.slice(from, to);
                    const first = span[0];
                    const last = span[span.length - 1];

                    if (CONNECTORS.has(first) || CONNECTORS.has(last)) continue;

                    if (span.length === 1) {
                        if (isStopword(first)) continue;

                        // A lone capital at the start of a sentence is often just grammar ("Honestly", "Running"),
                        // but can be a name ("Mercury"), so it's kept with a low prior if it isn't an everyday word
                        const sentenceInitial = run.start + from === 0;
                        if (sentenceInitial && !isAcronym(first)) {
                            if (!isOrdinaryWord(first))
                                addCandidate(candidates, { term: first, prior: 15, tier: "name" });
                            continue;
                        }

                        addCandidate(candidates, { term: first, prior: 60, tier: "name" });
                        continue;
                    }

                    if (isStopword(last)) continue;

                    addCandidate(candidates, { term: span.join(" "), prior: 50 + 10 * span.length, tier: "name" });
                }

                const ending = run.words.slice(from);
                if (CONNECTORS.has(ending[0])) continue;
                // "The speech" or "Honestly though" aren't names
                if (ending.length === 1 && (isStopword(ending[0]) || run.start + from === 0)) continue;

                for (let length = 1; length <= run.tail.length; length++) {
                    const span = [...ending, ...run.tail.slice(0, length)];
                    addCandidate(candidates, { term: span.join(" "), prior: 50 + 10 * span.length, tier: "name" });
                }
            }
        });

        // Jargon: lowercase phrases of 2–4 words that don't start or end with a filler word
        for (let from = 0; from < words.length; from++) {
            for (let length = 2; length <= 4 && from + length <= words.length; length++) {
                const span = words.slice(from, from + length);

                if (span.some(isCapitalised)) break;
                if (isStopword(span[0]) || isStopword(span[span.length - 1])) continue;

                addCandidate(candidates, { term: span.join(" "), prior: 20 + 5 * length, tier: "phrase" });
            }
        }

        words
            .filter(word => !isCapitalised(word))
            .forEach(word => addLowercaseWord(candidates, word));
    });

    return [...candidates.values()]
        .sort((a, b) => b.prior - a.prior || b.term.length - a.term.length)
        .slice(0, limit);
}
