const { origin, pathname } = window.location;
const BASE_URL = `${origin}${pathname}`.replace(/\/$/, "");

export async function getLookup(text: string) {
    const lookupResponse = await fetch(`${BASE_URL}/api/lookup?text=${encodeURIComponent(text)}`);
    const lookupResult = await lookupResponse.json();

    return lookupResult;
}

export async function getRecent() {
    const recentResponse = await fetch(`${BASE_URL}/api/recent`);
    const recentResult = await recentResponse.json();

    return recentResult;
}
