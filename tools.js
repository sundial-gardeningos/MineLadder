// Tool schema sent to Groq so the model knows this function exists.
const toolSchemas = [
  {
    type: "function",
    function: {
      name: "search_minecraft_wiki",
      description:
        "Search the Minecraft Wiki for a topic and return short summaries of the top matching pages. Use this to verify game mechanics, items, or recipes you're not fully certain about.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search terms, e.g. 'iron farm' or 'ancient city'",
          },
        },
        required: ["query"],
      },
    },
  },
];

// Actual implementation — called when the model requests this tool.
async function searchMinecraftWiki(query) {
  const url = `https://minecraft.wiki/api.php?action=query&list=search&srsearch=${encodeURIComponent(
    query
  )}&format=json&srlimit=3`;

  const res = await fetch(url);
  if (!res.ok) {
    return { error: `Wiki search failed with status ${res.status}` };
  }
  const data = await res.json();
  const results = (data?.query?.search || []).map((r) => ({
    title: r.title,
    snippet: r.snippet.replace(/<\/?span[^>]*>/g, ""), // strip <span class="searchmatch"> tags
  }));

  return { results };
}

// Dispatch table so server.js doesn't need to know tool internals.
const toolImplementations = {
  search_minecraft_wiki: async (args) => searchMinecraftWiki(args.query),
};

module.exports = { toolSchemas, toolImplementations };
