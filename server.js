require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { buildSystemPrompt } = require("./lib/systemPrompt");
const { toolSchemas, toolImplementations } = require("./lib/tools");

const app = express();
app.use(cors());
app.use(express.json());

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
// Double-check this against console.groq.com/docs — model IDs change over time.
const MODEL = "llama-3.3-70b-versatile";

async function callGroq(messages) {
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      tools: toolSchemas,
      tool_choice: "auto",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Groq API error ${res.status}: ${text}`);
  }
  return res.json();
}

// Runs the tool-calling loop until the model gives a final answer.
// maxRounds guards against a runaway loop if the model keeps calling tools.
async function chatWithTools(messages, maxRounds = 4) {
  for (let round = 0; round < maxRounds; round++) {
    const data = await callGroq(messages);
    const message = data.choices[0].message;

    if (!message.tool_calls || message.tool_calls.length === 0) {
      return message.content;
    }

    messages.push(message); // the assistant's tool-call request

    for (const call of message.tool_calls) {
      const impl = toolImplementations[call.function.name];
      let result;
      try {
        const args = JSON.parse(call.function.arguments || "{}");
        result = impl ? await impl(args) : { error: "Unknown tool" };
      } catch (err) {
        result = { error: `Tool execution failed: ${err.message}` };
      }
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }
  }
  return "I'm having trouble finishing that lookup — try asking again in a moment.";
}

app.use(express.static("public"));

app.post("/api/chat", async (req, res) => {
  try {
    const { history = [], playerState = null } = req.body;

    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({ error: "Server is missing GROQ_API_KEY." });
    }

    const messages = [
      { role: "system", content: buildSystemPrompt(playerState) },
      ...history, // [{role: "user"|"assistant", content: "..."}]
    ];

    const reply = await chatWithTools(messages);
    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong talking to the guide." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MineLadder backend listening on port ${PORT}`);
});
