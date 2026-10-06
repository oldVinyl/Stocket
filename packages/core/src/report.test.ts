import test from "node:test";
import assert from "node:assert/strict";
import { demoSnapshot, inventoryReportHtml } from "./index";

test("PDF report escapes company and catalog text and excludes archived supplies", () => {
  const data = demoSnapshot();
  data.company.name = '<script>alert("company")</script>';
  data.catalog[0].name = "Paper <A4> & notes";
  data.items[1].archived_at = new Date().toISOString();
  const report = inventoryReportHtml(data);
  assert.ok(report.includes("&lt;script&gt;"));
  assert.ok(!report.includes("<script>"));
  assert.ok(report.includes("Paper &lt;A4&gt; &amp; notes"));
  assert.ok(!report.includes("Black ink cartridge"));
  assert.ok(report.includes("<strong>7</strong>Supplies"));
});

test("PDF report uses the same strict low-stock threshold as inventory", () => {
  const data = demoSnapshot();
  data.items = [data.items[0]];
  data.items[0].quantity = data.items[0].low_stock_threshold;
  let report = inventoryReportHtml(data);
  assert.ok(report.includes("<strong>0</strong>Need a top-up"));
  assert.ok(report.includes('class="status "'));
  data.items[0].quantity -= 1;
  report = inventoryReportHtml(data);
  assert.ok(report.includes("<strong>1</strong>Need a top-up"));
  assert.ok(report.includes('class="status low"'));
});
