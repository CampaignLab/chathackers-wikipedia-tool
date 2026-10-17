// Runs the test messages against live Wikipedia and reports which replies were relevant.
// Usage: npm run evaluate

import testMessages from "./testMessages";
import { explainMessage, LookupResult } from "./lookup";

const describe = (result: LookupResult) => {
    if (result.kind === "match") return result.summary.title;
    if (result.kind === "ambiguous") return `ambiguous (${result.term}: ${result.options.map(option => option.title).join(", ")})`;
    if (result.kind === "suggestions") return `suggestions (${result.options.map(option => option.title).join(", ")})`;
    return result.kind;
};

const passes = (result: LookupResult, expect: string) => {
    if (expect === "none") return result.kind === "none";
    if (expect === "ambiguous") return result.kind === "ambiguous";
    if (expect === "suggestions") return result.kind === "suggestions";
    if (expect.startsWith("suggest:"))
        return result.kind === "suggestions" && result.options.some(option => option.title === expect.slice("suggest:".length));
    return result.kind === "match" && result.summary.title === expect;
};

async function evaluate() {
    let passed = 0;

    for (const test of testMessages) {
        const { result } = await explainMessage(test.text);
        const ok = passes(result, test.expect);
        if (ok) passed++;

        console.log(`${ok ? "PASS" : "FAIL"}  [${test.category}] ${test.text}`);
        if (!ok) console.log(`      expected ${test.expect}, got ${describe(result)}`);
    }

    console.log(`\n${passed}/${testMessages.length} relevant`);
}

evaluate();
