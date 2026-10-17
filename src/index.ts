import express from "express";
import * as fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import handleEvent, { recentLookups } from "./message";
import { explainMessage } from "./lookup";
import { formatResult } from "./format";

const port = Number(process.env.PORT ?? 5058);

// The Tool Hub has to reach this URL, so set TOOL_URL to your ngrok / Cloudflare tunnel address
const url = process.env.TOOL_URL ?? `http://localhost:${port}`;

const moduleRegistration = {
  id: "wikipedia",
  uuid: uuidv4(),
  url,
  emoji: "📖",
  introduction: "React 📖 to any message and I'll reply with a short Wikipedia explanation of what it mentions. React 🔎 to get it privately instead, or send !wiki followed by a term.",
  title: "Wikipedia Context",
  description: "Explains people, places, organisations and jargon mentioned in the chat, with a link to Wikipedia.",
  event_types: [
    "m.room.message", "m.reaction"
  ]
}

function generateRegistrationFile() {
  fs.writeFileSync(`./${moduleRegistration.id}.json`, JSON.stringify(moduleRegistration, null, 2));
}

async function start() {
  const app = express();
  app.use(express.json());

  app.get("/", async (req, res) => {
    const htmlPath = path.resolve(__dirname, "../web/dist/index.html")

    res.sendFile(htmlPath);
  })

  app.post("/", async (req, res) => {
    const { event, botUserId } = req.body;

    console.log("event received", event)

    const response = await handleEvent(event, botUserId);

    console.log("response", response);

    res.send({ success: true, response });
  });

  // Test bench for the dashboard: shows what the bot would reply to a message, and why
  app.get("/api/lookup", async (req, res) => {
    const text = String(req.query.text ?? "");

    try {
      const { result, candidates } = await explainMessage(text);

      res.send({ reply: formatResult(result).message, result, candidates });
    }
    catch (err) {
      console.log(err);
      res.status(502).send({ error: "Wikipedia request failed" });
    }
  })

  app.get("/api/recent", async (req, res) => {
    res.send(recentLookups);
  })

  app.listen(port);
  console.log(`Wikipedia tool listening on port ${port}, registered at ${url}`);
};

generateRegistrationFile();
start();
