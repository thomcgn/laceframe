/* global exports */
// Scope labels to the active workspace: retained Studio drafts intentionally remain mounted but hidden.
const scope = (page) =>
  page.locator(
    ".studio-editor:visible, .studio-context:visible, .art-direction-workspace:visible, .library-workspace:visible, .characters-workspace:visible, .character-bar:visible, .project-management, .create-action-bar:visible, .modal-backdrop:visible",
  );
exports.field = (page, ...args) => scope(page).getByLabel(...args);
exports.image = (page, ...args) => scope(page).getByAltText(...args);
exports.text = (page, ...args) =>
  page.getByText(...args).filter({ visible: true });
exports.nav = async (page, view, legacy = false) => {
  await page
    .getByRole("navigation", { name: "Hauptnavigation" })
    .getByRole("button", { name: new RegExp(view + "$") })
    .click();
  if (legacy) {
    const tools = page.locator(".expression-tools");
    if (!(await tools.getAttribute("open").then((v) => v !== null)))
      await tools.locator("summary").first().click();
  }
};

exports.selectMaskTool = async (editor, id) => {
  const names = {
    pick: "Pipette",
    auto: "Automatische Hintergrundauswahl",
    paint: "Pinsel",
    erase: "Radierer",
    protect: "Schützen",
    "protect-erase": "Schutz radieren",
    force: "Hintergrund erzwingen",
    "force-erase": "Erzwungenen Hintergrund radieren",
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
