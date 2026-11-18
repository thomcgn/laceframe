/* global exports */
// Scope labels to the active workspace: retained Studio drafts intentionally remain mounted but hidden.
const scope = (page) =>
  page.locator(
    ".expressions-workspace:visible, .studio-editor:visible, .studio-context:visible, .art-direction-workspace:visible, .library-workspace:visible, .characters-workspace:visible, .character-bar:visible, .project-management, .create-action-bar:visible, .modal-backdrop:visible",
  );
exports.field = (page, ...args) => scope(page).getByLabel(...args);
exports.image = (page, ...args) => scope(page).getByAltText(...args);
exports.text = (page, ...args) =>
  page.getByText(...args).filter({ visible: true });
exports.nav = async (page, view) => {
  await page
    .getByRole("navigation", { name: "Hauptnavigation" })
    .getByRole("button", { name: new RegExp(view + "$") })
    .click();
};

exports.selectMaskTool = async (editor, id) => {
  const names = {
    pick: "Pipette",
    auto: "Automatische Hintergrundauswahl",
    paint: "Pinsel",
    erase: "Radierer",
    protect: "Figur schützen",
    "protect-erase": "Schutz radieren",
    force: "Hintergrund entfernen",
    "force-erase": "Entfernung radieren",
    polygon: "Polygon/Lasso",
    pan: "Verschieben",
  };
  await editor
    .getByRole("toolbar", { name: "Maskenwerkzeuge" })
    .getByRole("button", { name: names[id], exact: true })
    .click();
};
exports.zoomMask = async (editor, factor) => {
  const slider = editor.getByLabel("Maskenzoom", { exact: true });
  const value = await slider.inputValue();
  await slider.fill(String(Number(value) + Math.log2(factor)));
};

// Navigate the actual task tabs; never reveal hidden fields by modifying the DOM.
exports.studioStep = async (page, name) => {
  const tabs = page
    .locator(".studio-editor:visible")
    .getByRole("navigation", { name: "Studio Schritte" });
  await tabs.getByRole("button", { name: new RegExp(name + "$") }).click();
};
exports.studioExpert = async (page) => {
  await exports.studioStep(page, "Erzeugen");
  await page
    .locator(".studio-editor:visible")
    .getByRole("checkbox", { name: "Expertenansicht", exact: true })
    .check();
};
