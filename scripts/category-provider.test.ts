import test from "node:test";
import assert from "node:assert/strict";
import { GeminiProvider } from "../supabase/functions/_shared/category-provider";

test("AI accepts a genuinely new category and validates catalog identities and quota failures", async () => {
  const prior = globalThis.fetch;
  let result: unknown = { name: "Office equipment", parent_id: null };
  let status = 200;
  let sent: any;
  globalThis.fetch = async (_url, init) => {
    sent = JSON.parse(String(init?.body));
    return new Response(
      JSON.stringify({
        candidates: [
          { content: { parts: [{ text: JSON.stringify(result) }] } },
        ],
      }),
      { status, headers: { "Content-Type": "application/json" } },
    );
  };
  try {
    const provider = new GeminiProvider("test-key", "gemini-2.5-flash");
    const categories = [
      { id: "paper", name: "Paper & notes", parent_id: null },
    ];
    assert.deepEqual(await provider.suggest("Desk fan", categories), {
      name: "Office equipment",
      parent_id: null,
    });
    assert.match(sent.contents[0].parts[0].text, /Never force unrelated/);
    assert.equal(sent.generationConfig.thinkingConfig.thinkingBudget, 0);
    result = { category_id: "paper" };
    assert.deepEqual(await provider.suggest("A4 paper", categories), result);
    result = { category_id: "nonexistent" };
    await assert.rejects(
      provider.suggest("Desk fan", categories),
      /not in the catalog/,
    );
    result = {};
    await assert.rejects(
      provider.suggest("Desk fan", categories),
      /usable category/,
    );
    status = 429;
    await assert.rejects(
      provider.suggest("Desk fan", categories),
      /free-tier quota/,
    );
  } finally {
    globalThis.fetch = prior;
  }
});
