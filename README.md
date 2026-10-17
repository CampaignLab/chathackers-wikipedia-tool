# Wikipedia Context Chathackers Module

Wikipedia context module for Chathackers Matrix chat integration tools. Forked from [welcome-tool](https://github.com/Chat-Hackers/welcome-tool).

When someone reacts to a message with 📖, the tool finds the most relevant person, place, organisation or term in it and replies with a one or two line summary and a Wikipedia link. If the term is ambiguous it lists the likely meanings, and if nothing matches it says so rather than guessing.

## Using it in a group

| Do this | Get this |
| --- | --- |
| React 📖 to a message | A reply in the group explaining the main thing it mentions |
| React 🔎 to a message | The same reply, sent privately to you |
| Send `!wiki gerrymandering` | An explanation of that term (with spelling suggestions if there's no exact article) |
| Quote reply `!wiki` to a message | Same as reacting 📖 |
| Quote reply a number to the bot's list | The explanation for that option |

## Getting started

1. Clone the repo
1. Run the command `npm install`
1. Copy `.env.example` to `.env` and set `TOOL_URL` to your ngrok or Cloudflare tunnel URL (the Tool Hub can't reach `localhost`)
1. Run the command `npm run build-web` to build the dashboard
1. Run the command `npm run dev`
1. Copy the generated `wikipedia.json` into the `registrations` folder of [the Tool Hub](https://github.com/Chat-Hackers/tool-hub) and add it to the registrations tab of the tech doc
1. Switch the tool on in your test group, then react 📖 to a message

## Checking relevance

`npm run evaluate` runs the test messages in `src/testMessages.ts` (people, places, organisations, jargon, ambiguous names and messages that should match nothing) against live Wikipedia and reports which replies were relevant. Add a message whenever you find one the bot gets wrong.

The dashboard (`GET /`) has a test bench: type a message and see the reply plus every candidate term, its priority and the article it matched.

## How it picks a term

1. `src/terms.ts` pulls candidate terms out of the message: quoted phrases, runs of capitalised words ("Bank of England", "Friends of the Earth"), names followed by lowercase words ("Overton window"), lowercase phrases ("first past the post") and unusual single words ("gerrymandering"). Each gets a priority: quoted > longer names > shorter names > phrases > single words. Filler words and everyday word forms ("apparently", "snacks") are skipped.
2. `src/wikipedia.ts` checks every candidate against Wikipedia's exact titles and redirects in one request. Only exact titles count, so the bot never replies with a loosely related article.
3. `src/lookup.ts` explains the highest priority match. Other distinct matches are offered as numbered follow-ups. If the match is a disambiguation page, the reply lists the likeliest meanings from that page instead of picking one.

## Decisions on the open questions

- **Trigger:** emoji reaction, because it works on any message without typing, plus `!wiki` for when the bot can't find the right term.
- **Several keywords:** the priority order above, with the runners-up offered as follow-ups.
- **Where the reply goes:** the group by default, privately with 🔎. The Tool Hub sends replies as plain messages, so threaded replies aren't possible without changing the Hub.
- **Repeated reactions:** each message is explained in the group once (for 24 hours). Private requests are tracked per person. This is kept in memory, so a restart forgets it.

## Known limitations

See [docs/multiple-mentions.md](docs/multiple-mentions.md) for how the tool handles messages that mention several people, places and events, the options for improving it, and the test results.

- First names that are also places resolve to the place: "Jordan said he'd bring the banner" explains the country.
- Options for an ambiguous term aren't ranked by what the chat is about. For "LTN scheme" the right meaning (low traffic neighbourhood) is listed fourth, behind Luton Airport.
- English Wikipedia only.
- Private replies use the Hub's `recipient` field, which hasn't been tried with a bridged WhatsApp or Signal user yet.
