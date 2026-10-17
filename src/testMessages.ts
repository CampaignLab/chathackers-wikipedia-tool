// Test messages for checking the bot picks the right term and the right article.
// expect: the article title it should explain, "ambiguous" if it should offer options, or "none".

export type TestMessage = {
    category: "person" | "place" | "organisation" | "jargon" | "ambiguous" | "none";
    text: string;
    expect: string;
}

const testMessages: TestMessage[] = [
    { category: "person", text: "Did anyone see what Keir Starmer said about housing last night?", expect: "Keir Starmer" },
    { category: "person", text: "Reading a biography of Mary Wollstonecraft at the moment, she was way ahead of her time", expect: "Mary Wollstonecraft" },
    { category: "person", text: "The speech reminded me of Nye Bevan tbh", expect: "Aneurin Bevan" },
    { category: "person", text: "honestly I think Ada Lovelace deserves more credit than she gets", expect: "Ada Lovelace" },

    { category: "place", text: "The next regional meetup will be in Milton Keynes", expect: "Milton Keynes" },
    { category: "place", text: "Has anyone been canvassing in Tower Hamlets recently?", expect: "London Borough of Tower Hamlets" },
    { category: "place", text: "Flights to Reykjavik are cheap this month if anyone fancies it", expect: "Reykjavík" },

    { category: "organisation", text: "We should get a speaker from the Joseph Rowntree Foundation", expect: "Joseph Rowntree Foundation" },
    { category: "organisation", text: "The Electoral Commission just published new guidance on spending", expect: "Electoral Commission (United Kingdom)" },
    { category: "organisation", text: "is the NHS going to be part of the manifesto?", expect: "National Health Service" },
    { category: "organisation", text: "There's a good report from the Bank of England on inflation", expect: "Bank of England" },

    { category: "jargon", text: "This is basically gerrymandering isn't it", expect: "Gerrymandering" },
    { category: "jargon", text: "the problem with first past the post is wasted votes", expect: "First-past-the-post voting" },
    { category: "jargon", text: "we need to talk about participatory budgeting at the next meeting", expect: "Participatory budgeting" },
    { category: "jargon", text: "Can someone explain what \"quantitative easing\" actually means?", expect: "Quantitative easing" },

    { category: "organisation", text: "Shall we invite someone from Greenpeace and Friends of the Earth?", expect: "Friends of the Earth" },
    { category: "jargon", text: "the Overton window has shifted a lot", expect: "Overton window" },
    { category: "jargon", text: "anyone know much about universal basic income?", expect: "Universal basic income" },

    { category: "ambiguous", text: "Mercury is in retrograde apparently", expect: "ambiguous" },
    { category: "ambiguous", text: "The council is consulting on a new LTN scheme", expect: "ambiguous" },
    { category: "ambiguous", text: "John Smith was a great leader", expect: "ambiguous" },
    { category: "ambiguous", text: "Is anyone going to Cambridge on Saturday?", expect: "Cambridge" },

    { category: "none", text: "See you all at the meeting tomorrow, bring snacks", expect: "none" },
    { category: "none", text: "lol yeah that's exactly what I meant", expect: "none" },
    { category: "none", text: "Can someone send me the link to the doc again?", expect: "none" },
    { category: "none", text: "Running about 10 minutes late, start without me", expect: "none" },
];

export default testMessages;
