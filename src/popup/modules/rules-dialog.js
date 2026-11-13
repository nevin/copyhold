// Auto-tag rules: list, add, edit, delete, and apply them to clips already saved.
import { t, tn } from "../../lib/i18n.js";
import { applyRules, cleanRule } from "../../lib/rules.js";
import { getSettings, onSettingsChange, updateSettings } from "../../lib/settings.js";
import * as store from "../../lib/store.js";
import { updateOrganizeOptions } from "./bulk.js";
import { byId, run, textLine } from "./dom.js";
import { confirmAction } from "./editor.js";
import { refresh } from "./list.js";
import { state } from "./state.js";

const dialog = byId("rules-dialog");
const form = byId("rule-form");
const fields = {
  kind: byId("rule-kind"),
  value: byId("rule-value"),
  category: byId("rule-category"),
  subcategory: byId("rule-subcategory"),
  tags: byId("rule-tags"),
};
const valuePlaceholders = { contains: "invoice", domain: "github.com", pattern: "^INV-\\d+" };
/** @type {import("../../lib/rules.js").Rule[]} */
let rules = [];
let editingId;

function describe(rule) {
  const condition = t(`ruleSummary_${rule.kind}`, rule.value);
  const actions = [];
  if (rule.category) actions.push(rule.subcategory ? t("categoryPath", rule.category, rule.subcategory) : rule.category);
  actions.push(...rule.tags.map((tag) => `#${tag}`));
  return { condition, actions: actions.join(" · ") };
}

function render() {
  const list = byId("rules-list");
  if (!rules.length) {
    list.replaceChildren(textLine("li", "filter-empty", t("noRulesYet")));
    return;
  }
  list.replaceChildren(...rules.map((rule) => {
    const item = document.createElement("li");
    item.className = "manage-item";
    const { condition, actions } = describe(rule);
    const summary = document.createElement("div");
    summary.className = "rule-summary";
    summary.append(textLine("strong", "", condition), document.createElement("br"), textLine("span", "rule-actions", actions));
    const edit = Object.assign(document.createElement("button"), { type: "button", className: "quiet", textContent: t("edit") });
    edit.addEventListener("click", () => startEdit(rule));
    const remove = Object.assign(document.createElement("button"), { type: "button", className: "quiet", textContent: t("delete") });
    remove.addEventListener("click", () => run(async () => {
      if (!await confirmAction(t("deleteRuleTitle"), condition, t("delete"), true)) return;
      await save(rules.filter(({ id }) => id !== rule.id));
    }));
    item.append(summary, edit, remove);
    return item;
  }));
}

function resetForm() {
  editingId = undefined;
  form.reset();
  byId("rule-form-title").textContent = t("newRule");
  byId("rule-save").textContent = t("addRule");
  byId("rule-cancel").hidden = true;
  byId("rule-status").textContent = "";
  fields.value.placeholder = valuePlaceholders.contains;
}

function startEdit(rule) {
  editingId = rule.id;
  fields.kind.value = rule.kind;
  fields.value.value = rule.value;
  fields.category.value = rule.category;
  fields.subcategory.value = rule.subcategory;
  fields.tags.value = rule.tags.join(", ");
  fields.value.placeholder = valuePlaceholders[rule.kind];
  byId("rule-form-title").textContent = t("editRule");
  byId("rule-save").textContent = t("saveRule");
  byId("rule-cancel").hidden = false;
  fields.value.focus();
}

async function save(next) {
  rules = next;
  await updateSettings({ rules });
  render();
}

fields.kind.addEventListener("change", () => {
  fields.value.placeholder = valuePlaceholders[fields.kind.value];
});
byId("rule-cancel").addEventListener("click", resetForm);
form.addEventListener("submit", (event) => {
  event.preventDefault();
  const { rule, error } = cleanRule({
    id: editingId,
    kind: fields.kind.value,
    value: fields.value.value,
    category: fields.category.value,
    subcategory: fields.subcategory.value,
    tags: fields.tags.value.split(","),
  });
  if (error) {
    byId("rule-status").textContent = t(error);
    return;
  }
  run(async () => {
    await save(editingId ? rules.map((existing) => (existing.id === editingId ? rule : existing)) : [...rules, rule]);
    resetForm();
    byId("rules-apply-status").textContent = t("ruleSaved");
  });
});

byId("apply-rules").addEventListener("click", () => run(async () => {
  let changed = 0;
  for (const clip of state.clips) {
    if (clip.kind === "image") continue;
    const result = applyRules(clip, rules);
    if (!result.matched) continue;
    const tagsChanged = result.tags.join("\n") !== (clip.tags ?? []).join("\n");
    const categoryChanged = result.category !== (clip.category ?? "");
    if (!tagsChanged && !categoryChanged) continue;
    await store.update(clip.id, { category: result.category, subcategory: result.subcategory, tags: result.tags });
    changed++;
  }
  await refresh();
  byId("rules-apply-status").textContent = tn("rulesApplied", changed);
}));
byId("close-rules").addEventListener("click", () => dialog.close());

byId("manage-rules").addEventListener("click", () => run(async () => {
  rules = (await getSettings()).rules;
  resetForm();
  byId("rules-apply-status").textContent = "";
  updateOrganizeOptions("");
  render();
  dialog.showModal();
}));
onSettingsChange((changes) => {
  if (!("rules" in changes)) return;
  rules = changes.rules;
  if (dialog.open) render();
});
