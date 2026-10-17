# Messages with several mentions of interest

How the Wikipedia Context tool behaves when one message mentions several things worth explaining (for example a person, a historical event and a place), where that falls short, and the options for improving it.

Results below were taken from the running tool on 17 October 2026, against live English Wikipedia.

## Current behaviour

The tool gives **one full explanation for the highest-priority term**, then lists up to four other distinct matches. Replying to the bot's message with a number explains that option.

**"Clement Attlee founded the NHS after the Second World War, and Tolpuddle is where the trade union movement started"**

```
📖 World War II
World War II, or the Second World War, was a global conflict between two coalitions: the Allies and the Axis powers. Nearly all of the world's countries participated, with many engaging in total war on an unprecedented scale.
https://en.wikipedia.org/wiki/World_War_II

Also mentioned, reply with a number to look one up:
1. Clement Attlee
2. Tolpuddle
3. National Health Service
4. Labour movement
```

**"Churchill gave a famous speech in Fulton after the Second World War"**

```
📖 World War II
World War II, or the Second World War, was a global conflict between two coalitions: the Allies and the Axis powers. …
https://en.wikipedia.org/wiki/World_War_II

Also mentioned, reply with a number to look one up:
1. Winston Churchill
```

### How the order is decided

Candidate terms are ranked by their shape, not by what they are (see `src/terms.ts`):

| Kind of candidate | Priority | Example |
| --- | --- | --- |
| Quoted phrase | 100 | `"quantitative easing"` |
| Capitalised name, n words | 50 + 10 × n | Second World War = 80, Clement Attlee = 70 |
| Single capitalised word or acronym | 60 | Tolpuddle, NHS |
| Lowercase phrase, n words | 20 + 5 × n | trade union movement = 35 |
| Capitalised word at the start of a sentence | 15 | Churchill (in "Churchill gave…") |
| Unusual single lowercase word | 10 | gerrymandering |

Only terms with an exact Wikipedia title or redirect count. Terms that overlap the chosen one are dropped ("Second World", "World War" and "War" are all part of "Second World War"). Terms that land on a disambiguation page are left out of the follow-up list.

## Where it falls short

1. **The main term is often the least useful one.** "Second World War" wins because it has the most capitalised words, but most people already know what it is. The person or the lesser-known place is usually what someone wants explained.
2. **A name at the start of a sentence is ranked very low.** A capitalised first word is usually just grammar ("Honestly", "Running"), so it gets priority 15. That pushed Churchill into the follow-up list.
3. **Ambiguous places disappear.** Fulton is a disambiguation page, so it isn't offered at all, even though it's central to the message (the "Iron Curtain" speech at Fulton, Missouri).
4. **The tool has no idea what kind of thing a term is.** It can't tell a person from an event or a place, so it can't balance a reply across them.

## Options

### 1. Explain several terms in one reply (recommended)

Reply with up to three short entries, one per distinct mention, each one sentence plus a link. A mock-up (not yet built, so the wording is illustrative):

```
📖 Clement Attlee: Prime Minister of the United Kingdom from 1945 to 1951. https://en.wikipedia.org/wiki/Clement_Attlee
📖 Tolpuddle: A village in Dorset, known for the Tolpuddle Martyrs. https://en.wikipedia.org/wiki/Tolpuddle
📖 National Health Service: The publicly funded healthcare systems of the UK. https://en.wikipedia.org/wiki/National_Health_Service
More: reply 1 for World War II, 2 for Labour movement
```

- **For:** answers "who, what and where" in one go, which is what someone trying to follow the conversation needs.
- **Against:** a longer message in the group. Wikidata short descriptions (already returned by the API as `description`) keep each entry to one line.
- **Work:** change `formatResult` in `src/format.ts` and return the top three distinct matches from `explainMessage` in `src/lookup.ts`, not just one.

### 2. Ask which one first

```
📖 This message mentions:
1. Clement Attlee
2. National Health Service
3. World War II
4. Tolpuddle
Reply with a number to look one up.
```

- **For:** keeps the group chat quiet and never explains the wrong thing.
- **Against:** every lookup takes two steps, and the one-step reply for a single mention is lost unless it's special-cased.
- **Work:** small. The numbered-reply handling already exists in `src/message.ts`.

### 3. Rank by type of thing

Look up each matched article's Wikidata item (the API returns `wikibase_item`) and use its "instance of" value to rank people and places above broad events, or to choose one of each.

- **For:** directly targets "a person, an event and a place".
- **Against:** an extra API call per lookup, and a mapping from Wikidata classes to categories that needs maintaining.
- **Work:** medium. Add a Wikidata request in `src/wikipedia.ts` and a type bonus in `src/lookup.ts`.

### 4. Prefer less familiar terms

Rank down articles almost everyone has heard of, using Wikipedia's page-view data (the `pageviews` property the tool already uses for disambiguation pages). World War II gets millions of views a month and Tolpuddle very few, so the obscure mention wins.

- **For:** cheap, and matches the goal of explaining what people might not know.
- **Against:** page views aren't the same as familiarity: niche jargon can be widely read, and a local figure may get few views but still be well known in the group.
- **Work:** small. Add page views to the title lookup and a penalty in the ranking.

### Recommendation

Combine options 1 and 4: explain up to three distinct mentions in one reply, ordered so that the less familiar ones come first. Separately, fix shortfall 3 by offering ambiguous terms as follow-ups ("Fulton could mean a few things, reply 3 to choose").

## Tests

### Regression set

`npm run evaluate` runs the 26 messages in `src/testMessages.ts` against live Wikipedia. Current result: **26/26 relevant**.

| Category | Messages | Example | Expected |
| --- | --- | --- | --- |
| Person | 4 | "The speech reminded me of Nye Bevan tbh" | Aneurin Bevan |
| Place | 3 | "Has anyone been canvassing in Tower Hamlets recently?" | London Borough of Tower Hamlets |
| Organisation | 5 | "Shall we invite someone from Greenpeace and Friends of the Earth?" | Friends of the Earth |
| Jargon | 6 | "the problem with first past the post is wasted votes" | First-past-the-post voting |
| Ambiguous | 4 | "Mercury is in retrograde apparently" | list of meanings |
| No match | 4 | "See you all at the meeting tomorrow, bring snacks" | "couldn't find" reply |

The rules were tuned against this set, so 26/26 overstates how well the tool does on new messages.

### Messages not used for tuning

These were run once before the fixes they prompted. 5 of 10 were wrong at first; 9 of 10 are right now.

| Message | First result | Now |
| --- | --- | --- |
| Andy Burnham is doing well in Manchester | Andy Burnham ✅ | Andy Burnham ✅ |
| Paris was lovely, the Louvre queue was huge though | Louvre ✅ | Louvre ✅ |
| anyone know much about universal basic income? | Summary cut mid-sentence ❌ | Universal basic income ✅ |
| Shall we invite someone from Greenpeace and Friends of the Earth? | Greenpeace, plus "Friends" and "Earth" as follow-ups ❌ | Friends of the Earth, Greenpeace as follow-up ✅ |
| Jordan said he'd bring the banner | Jordan (the country) ❌ | Jordan (the country) ❌ |
| The council is consulting on a new LTN scheme | Meanings missing low traffic neighbourhood ❌ | Lists it fourth, behind Luton Airport ⚠️ |
| Sounds like a filibuster to me | Filibuster ✅ | Filibuster ✅ |
| Great work everyone, really proud of this team | No match ✅ | No match ✅ |
| Phoenix is so hot in summer | List of meanings ✅ | List of meanings ✅ |
| the Overton window has shifted a lot | Overton (disambiguation) ❌ | Overton window ✅ |

### Multiple-mention cases to add

These aren't in the regression set yet, because the right behaviour depends on which option is chosen. Once one is built, add them to `src/testMessages.ts` with the expected terms.

| Message | Mentions | Should explain |
| --- | --- | --- |
| Clement Attlee founded the NHS after the Second World War, and Tolpuddle is where the trade union movement started | person, organisation, event, place, movement | Clement Attlee, Tolpuddle, NHS first; World War II as a follow-up |
| Churchill gave a famous speech in Fulton after the Second World War | person, place (ambiguous), event | Winston Churchill, Fulton (as options), then World War II |
| Mandela was held on Robben Island before the end of apartheid | person, place, policy | Nelson Mandela, Robben Island, Apartheid |
| The Peterloo Massacre happened in Manchester, and Henry Hunt was speaking | event, place, person | Peterloo Massacre, Henry Hunt, then Manchester |
| Emmeline Pankhurst and the WSPU campaigned outside Parliament | person, organisation, place | Emmeline Pankhurst, Women's Social and Political Union, then Parliament of the United Kingdom |
