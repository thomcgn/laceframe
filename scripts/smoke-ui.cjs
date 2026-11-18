/* global exports */
// Scope labels to the active workspace. Mode owners retain drafts; step controls render on demand.
const scope = (page) =>
  page.locator(
    ".expressions-workspace:visible, .studio-editor:visible, .studio-context:visible, .art-direction-workspace:visible, .library-workspace:visible, .characters-workspace:visible, .character-bar:visible, .project-management, .splash-screen, .create-action-bar:visible, .modal-backdrop:visible",
  );
exports.field = (page, ...args) => scope(page).getByLabel(...args);
exports.image = (page, ...args) => scope(page).getByAltText(...args);
exports.text = (page, ...args) =>
  page.getByText(...args).filter({ visible: true });
exports.nav = async (page, view) => {
  await page
    .getByRole("navigation", { name: "Hauptnavigation" })
    .getByRole("button", {
      name: new RegExp(
        ({
          Characters: "Figuren",
          Studio: "Studio",
          Expressions: "Ausdrücke",
          Library: "Bibliothek",
          Motion: "Animation",
          "Art Direction": "Stilgestaltung",
        }[view] ?? view) + "$",
      ),
    })
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

// New application entry: wait for the real ten-second boot; never bypass lifecycle.
exports.projectSelection = async (page) => {
  await page
    .getByRole("combobox", { name: /^(Language|Sprache)$/ })
    .selectOption("de");
  await page
    .getByRole("button", { name: "Neues Projekt", exact: true })
    .waitFor({ state: "visible", timeout: 25000 });
};
exports.prepareProjectCreation = async (page) => {
  await page
    .locator(".splash-screen, .project-management")
    .first()
    .waitFor({ state: "visible", timeout: 25000 });
  if (await page.locator(".splash-screen").count()) {
    await exports.projectSelection(page);
    await page
      .getByRole("button", { name: "Neues Projekt", exact: true })
      .click();
  }
};
