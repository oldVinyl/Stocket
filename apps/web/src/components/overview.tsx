import { ArrowRight, Check, CloudOff, TriangleAlert } from "lucide-react";
import { isLow, type Snapshot } from "@stocket/core";

export default function Overview({
  data,
  onInventory,
  onActivity,
  onAdjust,
}: {
  data: Snapshot;
  onInventory: (low?: boolean) => void;
  onActivity: () => void;
  onAdjust: (item: Snapshot["items"][number]) => void;
}) {
  const active = data.items.filter((i) => !i.archived_at),
    low = active.filter(isLow);
  const events = [...data.events]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 5);
  const healthy = active.length
    ? Math.round(((active.length - low.length) / active.length) * 100)
    : 0;
  return (
    <section className="overview-grid" aria-label="Workspace overview">
      <article className="overview-card stock-health">
        <span className="eyebrow">A LITTLE PEACE OF MIND</span>
        <h2>
          {active.length
            ? `${healthy}% of supplies are well stocked`
            : "A fresh pocket, ready to fill"}
        </h2>
        <p>
          {low.length
            ? `${low.length} ${low.length === 1 ? "supply needs" : "supplies need"} a top-up. Start with the list below.`
            : active.length
              ? "Everything is at or above its low-stock threshold. Your team is ready to go."
              : "Add your first supply to start tracking your office essentials."}
        </p>
        <div
          className="health-track"
          role="meter"
          aria-label="Well stocked supplies"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={healthy}
        >
          <span style={{ width: `${healthy}%` }} />
        </div>
        <button className="button primary" onClick={() => onInventory()}>
          Open inventory <ArrowRight size={17} />
        </button>
      </article>
      <article className="overview-card">
        <div className="overview-title">
          <h2>Needs a little attention</h2>
          <TriangleAlert size={21} />
        </div>
        {low.length ? (
          <>
            <div className="overview-rows">
              {low.slice(0, 4).map((item) => (
                <button key={item.id} onClick={() => onAdjust(item)}>
                  <div>
                    <strong>
                      {data.catalog.find((c) => c.id === item.catalog_item_id)
                        ?.name ?? "Supply"}
                    </strong>
                    <small>
                      {item.quantity} in stock · threshold{" "}
                      {item.low_stock_threshold}
                    </small>
                  </div>
                  <ArrowRight size={18} />
                </button>
              ))}
            </div>
            <button className="text-link" onClick={() => onInventory(true)}>
              View all low stock <ArrowRight size={16} />
            </button>
          </>
        ) : (
          <p className="overview-empty">
            <Check size={22} /> No low-stock alerts right now.
          </p>
        )}
      </article>
      <article className="overview-card">
        <div className="overview-title">
          <h2>Recent stock movements</h2>
          <button className="text-link" onClick={onActivity}>
            View activity <ArrowRight size={16} />
          </button>
        </div>
        {events.length ? (
          <div className="overview-rows">
            {events.map((event) => {
              const item = data.items.find((i) => i.id === event.item_id),
                name =
                  data.catalog.find((c) => c.id === item?.catalog_item_id)
                    ?.name ?? "Removed supply";
              return (
                <div key={event.id}>
                  <span
                    className={`event-delta ${event.delta > 0 ? "delta-positive" : event.delta < 0 ? "delta-negative" : ""}`}
                  >
                    {event.delta > 0 ? "+" : ""}
                    {event.delta}
                  </span>
                  <div>
                    <strong>{name}</strong>
                    <small>
                      {new Date(event.created_at).toLocaleString()} ·{" "}
                      {event.new_quantity} remaining
                    </small>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p>Your next stock update will appear here.</p>
        )}
      </article>
      <article className="overview-card">
        <div className="overview-title">
          <h2>Your stock at a glance</h2>
          <CloudOff size={21} />
        </div>
        <dl className="overview-totals">
          <dt>Active categories</dt>
          <dd>
            {
              new Set(
                active.map(
                  (i) =>
                    data.catalog.find((c) => c.id === i.catalog_item_id)
                      ?.category_id,
                ),
              ).size
            }
          </dd>
          <dt>Changes waiting to sync</dt>
          <dd>{data.queue.length}</dd>
          <dt>Supplies with no stock</dt>
          <dd>{active.filter((i) => i.quantity <= 0).length}</dd>
        </dl>
        <p className="guide-note">
          The cloud indicator in the header shows whether this device is synced,
          offline, or saving locally.
        </p>
      </article>
    </section>
  );
}
