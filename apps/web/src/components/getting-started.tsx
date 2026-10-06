import { ArrowRight, Play } from "lucide-react";

const chapters = [
  [
    "Make it your company’s workspace",
    "The Studio North workspace is a local demo. Choose Connect your company, enter an email your company has invited, and verify the email link or code. Finish your display name. Your company name replaces Studio North; demo stock stays separate.",
  ],
  [
    "Add your everyday supplies",
    "In Inventory, choose Add item and search by name. Pick an existing catalog match to reuse its photo and category, or create a new entry. Enter the starting quantity and low-stock threshold. Take or choose a photo for a new catalog entry; category suggestions are optional.",
  ],
  [
    "Record what comes in and goes out",
    "Choose Adjust stock on an item. Select Stock in for a delivery or Stock out when supplies are used, enter the number of units, and save. Stocket applies the change to the current quantity and records it in Activity.",
  ],
  [
    "Find what needs a top-up",
    "Search by name, filter by category or stock level, and switch between grid and list views. Orange marks mean the quantity is below the item’s threshold. Open the bell for a stock reminder, then select an alert to view the low-stock inventory.",
  ],
  [
    "Edit, remove, or bring an item back",
    "Use an item’s three-dot menu to edit its threshold or remove it. Removal is separate from quantity adjustments. Use Undo in the toast to restore it immediately, or find Removed supplies in Settings later.",
  ],
  [
    "Keep working offline",
    "Stock changes save on this device first. The cloud indicator shows offline, pending, or synced changes. A connected company syncs when the network returns; two devices’ quantity changes are added together. Demo changes stay in this browser and do not sync to a company.",
  ],
  [
    "Share a report and keep an eye on the day",
    "Export creates CSV or a formatted PDF of all active supplies, including categories, quantities, thresholds, and stock status. Overview shows your stock health and recent movements; Inventory is where you search and manage individual supplies.",
  ],
];
export default function GettingStarted({
  onTour,
  onCompanion,
}: {
  onTour: () => void;
  onCompanion: () => void;
}) {
  return (
    <div className="getting-started">
      <p>
        A quick guide to keeping the office essentials moving. Everyone in your
        company can manage stock.
      </p>
      <button className="button primary" onClick={onTour}>
        <Play size={17} /> Show me around
      </button>
      <ol className="guide-chapters">
        {chapters.map(([title, text], index) => (
          <li key={title}>
            <span className="guide-number">{index + 1}</span>
            <div>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          </li>
        ))}
      </ol>
      <button className="button secondary" onClick={onCompanion}>
        Get Stocket on your phone <ArrowRight size={17} />
      </button>
    </div>
  );
}
