"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { uuid, type Category } from "@stocket/core";
export default function CategoryManager({
  categories,
  onSave,
}: {
  categories: Category[];
  onSave: (category: Category) => Promise<unknown>;
}) {
  const [selected, setSelected] = useState("new"),
    [name, setName] = useState(""),
    [parent, setParent] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="settings-card category-manager item-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await onSave({
            id: selected === "new" ? uuid() : selected,
            name,
            parent_id: parent || null,
          });
          toast.success("A happy home for your supplies.");
          setSelected("new");
          setName("");
          setParent("");
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>Create or edit a category</h2>
      <p>
        Names and nesting are shared across the catalog. Your stock stays
        private.
      </p>
      <label>
        Choose a category
        <select
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            const c = categories.find((c) => c.id === e.target.value);
            setName(c?.name ?? "");
            setParent(c?.parent_id ?? "");
          }}
        >
          <option value="new">Create a new category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <div className="form-columns">
        <label>
          Category name
          <input
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Parent category
          <select value={parent} onChange={(e) => setParent(e.target.value)}>
            <option value="">No parent (top level)</option>
            {categories
              .filter((c) => c.id !== selected)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
      </div>
      <button className="button primary" disabled={busy}>
        <Plus size={18} />
        {selected === "new" ? "Create category" : "Save category"}
      </button>
    </form>
  );
}
