import "./App.css";
import { useEffect, useState } from "react";
import { getLookup, getRecent } from "./requests";

const samples = [
  "Did anyone see what Keir Starmer said about housing last night?",
  "the problem with first past the post is wasted votes",
  "Mercury is in retrograde apparently",
  "See you all at the meeting tomorrow, bring snacks",
];

type Candidate = { term: string, prior: number, tier: string, page?: { title: string, disambiguation: boolean } };
type Recent = { time: string, trigger: string, kind: string, reply: string };

export default function App() {
  const [text, setText] = useState(samples[0]);
  const [reply, setReply] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadRecent() {
    setRecent(await getRecent());
  }

  useEffect(() => {
    loadRecent();
  }, []);

  async function lookup(message: string) {
    setText(message);
    setLoading(true);
    const result = await getLookup(message);
    setReply(result.reply ?? result.error);
    setCandidates(result.candidates ?? []);
    setLoading(false);
  }

  return (
    <>
      <h1>Wikipedia Context</h1>
      <h3>Type a chat message to see what the bot would reply, and which terms it considered.</h3>
      <div id="change-container">
        <textarea value={text} onChange={(e) => setText(e.target.value)}></textarea>
        <button disabled={loading} onClick={() => lookup(text)}>{loading ? "Looking up…" : "Explain"}</button>
        <div className="samples">
          {samples.map(sample => <button key={sample} onClick={() => lookup(sample)}>{sample}</button>)}
        </div>
      </div>

      {reply && <div className="bubble">{reply}</div>}

      {candidates.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Term</th><th>Kind</th><th>Prior</th><th>Article</th></tr>
            </thead>
            <tbody>
              {candidates.map(candidate => (
                <tr key={candidate.term} className={candidate.page ? "" : "missing"}>
                  <td>{candidate.term}</td>
                  <td>{candidate.tier}</td>
                  <td>{candidate.prior}</td>
                  <td>{candidate.page ? `${candidate.page.title}${candidate.page.disambiguation ? " (disambiguation)" : ""}` : "none"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3>Recent replies in chats</h3>
      <button onClick={loadRecent}>Refresh</button>
      {recent.length === 0 && <p>Nothing yet. React 📖 to a message in a group with the tool switched on.</p>}
      {recent.map(lookup => (
        <div key={lookup.time} className="bubble">
          <small>{new Date(lookup.time).toLocaleString()} · {lookup.trigger} · {lookup.kind}</small>
          {"\n" + lookup.reply}
        </div>
      ))}
    </>
  );
}
