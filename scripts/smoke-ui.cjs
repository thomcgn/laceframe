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
