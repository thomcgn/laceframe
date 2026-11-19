// Focused Semantic Layers visual/integrity acceptance. Synthetic images; no generation provider.
const { _electron: electron, expect } = require("@playwright/test");
const { PNG } = require("pngjs");
const fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os");
const { field, nav } = require("./smoke-ui.cjs");
const { reviewImport } = require("./historical-master-fixture.cjs");
(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "laceframe-layer-ui-"));
  const dir = path.join(root, "project");
  await fs.mkdir(dir);
  const png = new PNG({ width: 512, height: 640 });
  for (let y = 32; y < 608; y++)
    for (let x = 64; x < 448; x++) {
      let color =
        y < 208
          ? [80, 60, 50, 255]
          : y < 400
            ? [190, 140, 110, 255]
            : [50, 90, 100, 255];
      if (
        y >= 256 &&
        y < 272 &&
        ((x >= 144 && x < 160) || (x >= 352 && x < 368))
      )
        color = [20, 24, 32, 255];
      if (y >= 352 && y < 368 && x >= 200 && x < 312)
        color = [120, 62, 67, 255];
      png.data.set(color, (y * 512 + x) * 4);
    }
  png.data.set([98, 78, 68, 255], (105 * 512 + 105) * 4);
  const bytes = PNG.sync.write(png),
    file = path.join(root, "synthetic.png");
  await fs.writeFile(file, bytes);
  const screenshots = path.resolve("artifacts/layers");
  await fs.mkdir(screenshots, { recursive: true });
  let app;
  const errors = [];
  try {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await electron.launch({
      executablePath: path.resolve("out/Laceframe-linux-x64/laceframe"),
      args: ["--user-data-dir=" + path.join(root, "user-data")],
      env,
    });
    let page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    page.on("pageerror", (e) => errors.push(e.message));
    const choose = (p) =>
      app.evaluate(({ dialog }, p) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [p],
        });
      }, p);
    const manifest = () =>
      fs.readFile(path.join(dir, "laceframe.json"), "utf8").then(JSON.parse);
    await choose(dir);
    await require("./smoke-ui.cjs").prepareProjectCreation(page);
    await field(page, "Projektname", { exact: true }).fill("Pixel pipeline");
    await page
      .getByRole("button", { name: "Projekt erstellen …", exact: true })
      .click();
    await field(page, "Neue Figur", { exact: true }).fill("Synthetic Pixel");
    await page
      .getByRole("button", { name: "Figur erstellen", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Synthetic Pixel", exact: true }),
    ).toBeVisible();
    await choose(file);
    await page
      .getByRole("button", { name: "Masterportrait auswählen …", exact: true })
      .click();
    await reviewImport(page);
    await page
      .getByRole("button", {
        name: "Freigegebenen Master sperren",
        exact: true,
      })
      .click();
    await expect.poll(async () => (await manifest()).masters.length).toBe(1);
    const master = (await manifest()).masters[0],
      masterBytes = await fs.readFile(path.join(dir, master.file));
    await nav(page, "Library");
    await field(page, "Bibliothek Asset", { exact: true }).selectOption(
      master.id,
    );

    await page.getByRole("button", {name:"Character Layers bearbeiten",exact:true}).click();
    let semantic=page.getByRole("dialog",{name:"Character Layers",exact:true});
    await semantic.getByRole("button",{name:"Gemeinsame Auswahlwerkzeuge …",exact:true}).click();
    let editor=page.getByRole("dialog",{name:"Auswahlwerkzeuge",exact:true});
    await expect(editor).toBeVisible();
    let canvas=editor.getByLabel("Interaktive Auswahlfläche",{exact:true});
    const click=async(x,y)=>{const box=await canvas.boundingBox();await page.mouse.click(box.x+x/512*box.width,box.y+y/640*box.height);};
    const drag=async(x,y,xx,yy)=>{const box=await canvas.boundingBox();await page.mouse.move(box.x+x/512*box.width,box.y+y/640*box.height);await page.mouse.down();await page.mouse.move(box.x+xx/512*box.width,box.y+yy/640*box.height,{steps:12});await page.mouse.up();};
    const tool=async name=>editor.getByRole("button",{name,exact:true}).click();
    const operation=async value=>editor.getByLabel("Auswahloperation",{exact:true}).selectOption(value);
    const selected=async count=>expect(editor.locator("footer")).toContainText(`${count} Pixel ausgewählt`);
    await click(100,100);await selected(67583);
    await operation("add");await click(105.5,105.5);await selected(67584);
    await tool("Rechteck");await operation("subtract");await drag(80,80,100,100);await selected(67184);
    await operation("intersect");await drag(64,32,448,208);await selected(67184);
    await tool("Farbbereich");await editor.getByLabel("Auf aktuelle Auswahl begrenzen",{exact:true}).check();
    await click(120,100);await tool("Farbbereich als Auswahl vorschauen");await selected(67184);
    await tool("Bézier-Pfad");await operation("replace");
    await drag(120,70,150,50);await click(300,70);await click(300,150);await click(120,150);
    await tool("Pfad schließen (Enter)");await drag(300,70,315,75);
    await tool("Pfad als Auswahl übernehmen");
    await expect(editor.locator("footer")).toContainText(/[1-9]\d* Pixel ausgewählt/);
    await editor.getByLabel("Name der Auswahl",{exact:true}).fill("Hair contour");
    await tool("Auswahlrevision speichern");
    await expect.poll(async()=>(await manifest()).editorSelections.length).toBe(1);
    const saved=(await manifest()).editorSelections[0];
    expect(saved.path.closed).toBe(true);expect(saved.path.nodes).toHaveLength(4);
    expect(saved.sourceId).toBe(master.id);expect(saved.sourceSha256).toBe(master.sha256);
    const savedBytes=await fs.readFile(path.join(dir,saved.mask.file));
    const selectedCount=PNG.sync.read(savedBytes).data.filter((_,i)=>i%4===0).filter(Boolean).length;
    expect(selectedCount).toBeGreaterThan(1000);expect(selectedCount).toBeLessThan(40000);
    await canvas.click({position:{x:20,y:20}});await page.keyboard.press("Control+d");await selected(0);
    await editor.getByLabel("Symmetrische Tangenten",{exact:true}).uncheck();
    await editor.getByLabel("Gespeicherte Auswahlen",{exact:true}).selectOption(saved.id);await tool("Auswahl und Pfad laden");await selected(selectedCount);
    await expect(editor.getByLabel("Symmetrische Tangenten",{exact:true})).toBeChecked();
    // Delete the saved revision: the mask file must be removed and the list must drop.
    await tool("Auswahlrevision löschen");
    await expect.poll(async()=>(await manifest()).editorSelections.length).toBe(0);
    await expect(editor.getByLabel("Gespeicherte Auswahlen",{exact:true}).locator("option").count()).toBe(1);
    // Native hidden-menu accelerators must yield to the focused editor without opening DevTools.
    await canvas.click({position:{x:20,y:20}});
    await page.keyboard.press("Control+Shift+i");await selected(221184-selectedCount);
    expect(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.isDevToolsOpened())).toBe(false);
    await page.keyboard.press("Control+z");await selected(selectedCount);
    await page.keyboard.press("Control+Shift+z");await selected(221184-selectedCount);
    await page.keyboard.press("Control+z");await selected(selectedCount);
    const invalidContext=await page.evaluate(()=>window.laceframe.editingContext("invalid"));expect(invalidContext.ok).toBe(false);
    // Text input never activates tool shortcuts. Wheel focus belongs to the viewport only.
    const nameField=editor.getByLabel("Name der Auswahl",{exact:true});
    await nameField.fill("brush");await page.keyboard.press("End");await page.keyboard.type("X");await page.keyboard.press("Control+z");await expect(nameField).toHaveValue("brush");await page.keyboard.press("b");
    await expect(editor.getByRole("button",{name:"Bézier-Pfad",exact:true})).toHaveAttribute("aria-pressed","true");
    for(const [width,height] of [[960,720],[1280,800],[1920,1080]]){
      await app.evaluate(({BrowserWindow},{width,height})=>BrowserWindow.getAllWindows()[0].setContentSize(width,height),{width,height});
      await expect.poll(()=>page.evaluate(()=>window.innerWidth)).toBe(width);
      await expect(editor.getByRole("button",{name:"Auswahl als Maske übernehmen",exact:true})).toBeInViewport();
      const box=await canvas.boundingBox();expect(box.width).toBeGreaterThan(220);expect(box.height).toBeGreaterThan(250);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
      await page.screenshot({path:path.join(screenshots,`professional-${width}.png`)});
    }
    // Canvas-only wheel, cursor anchoring and temporary pan never alter selection pixels.
    await tool("Pinsel");const view=editor.getByLabel("Bildfläche · Alt ziehen zum Verschieben",{exact:true});
    await editor.getByLabel("Name der Auswahl",{exact:true}).click();
    let zoomBefore=await editor.getByLabel("Bildzoom",{exact:true}).innerText();
    let frameBox=await view.boundingBox();await page.mouse.move(frameBox.x+frameBox.width/2,frameBox.y+frameBox.height/2);await page.mouse.wheel(0,-120);await expect(editor.getByLabel("Bildzoom",{exact:true})).toHaveText(zoomBefore);
    await view.focus();await page.mouse.wheel(0,-120);await expect(editor.getByLabel("Bildzoom",{exact:true})).not.toHaveText(zoomBefore);
    const stage=editor.locator(".pixel-camera-stage"),beforePan=await stage.getAttribute("style");
    await page.keyboard.down("Space");await expect(canvas).toHaveCSS("cursor","grab");await drag(200,110,225,120);await page.keyboard.up("Space");await expect(stage).not.toHaveAttribute("style",beforePan);await selected(selectedCount);
    await view.focus();await page.keyboard.press("f");await selected(selectedCount);
    // Cancel an actual captured pointer gesture: preview bytes and committed selection must return unchanged.
    const overlay=editor.locator("canvas.selection-overlay");
    const overlayHash=()=>overlay.evaluate(async c=>Array.from(new Uint8Array(await window.crypto.subtle.digest("SHA-256",c.getContext("2d").getImageData(0,0,c.width,c.height).data))).join(","));
    const beforeCancelledStroke=await overlayHash();await operation("add");
    await canvas.evaluate(c=>c.addEventListener("pointerdown",e=>{window.__selectionPointer=e.pointerId;},{once:true}));
    {const b=await canvas.boundingBox();await page.mouse.move(b.x+90/512*b.width,b.y+180/640*b.height);await page.mouse.down();await page.mouse.move(b.x+110/512*b.width,b.y+180/640*b.height,{steps:4});}
    await canvas.dispatchEvent("pointercancel",{pointerId:await page.evaluate(()=>window.__selectionPointer)});await page.mouse.up();
    await selected(selectedCount);await expect.poll(overlayHash).toBe(beforeCancelledStroke);
    // Actual shape and pixel-brush tools, then restore the saved curve before committing a layer.
    await tool("Ellipse");await operation("replace");await drag(120,70,220,150);await expect(editor.locator("footer")).toContainText(/[1-9]\d* Pixel ausgewählt/);
    await tool("Freihand-Lasso");
    {const box=await canvas.boundingBox();const to=async(x,y)=>page.mouse.move(box.x+x/512*box.width,box.y+y/640*box.height,{steps:6});await to(120,70);await page.mouse.down();await to(220,70);await to(220,150);await to(120,150);await page.mouse.up();}
    await expect(editor.locator("footer")).toContainText(/[1-9]\d* Pixel ausgewählt/);await page.keyboard.press("Control+z");
    await tool("Polygon-Lasso");await click(120,70);await click(220,70);await click(220,150);await click(120,150);await page.keyboard.press("Backspace");await click(120,150);await page.keyboard.press("Enter");await tool("Pfad als Auswahl übernehmen");
    await tool("Auswahl aufheben");await tool("Pinsel");await operation("add");await editor.getByLabel("Quadratische Spitze",{exact:true}).check();
    for(let i=0;i<20;i++)await click(150.5+i,100.5);await selected(20);
    for(let i=0;i<20;i++)await tool("Rückgängig");await selected(0);
    for(let i=0;i<20;i++)await tool("Wiederholen");await selected(20);
    await tool("Radierer");await editor.getByLabel("Quadratische Spitze",{exact:true}).check();await click(150.5,100.5);await selected(19);
    await tool("Pinsel");await operation("replace");await click(150.5,105.5);await selected(1);
    await operation("intersect");await click(151.5,105.5);await selected(0);
    await operation("add");await click(150.5,105.5);await selected(1);
    await operation("subtract");await click(150.5,105.5);await selected(0);
    await tool("Pipette");await click(100,100);await expect(editor.getByText(/#503c32/)).toBeVisible();
    await tool("Auswahl und Pfad laden");await selected(selectedCount);
    await tool("Auswahl als Maske übernehmen");await expect(editor).not.toBeVisible();
    await semantic.getByRole("button",{name:"Layerrevision speichern",exact:true}).click();await expect(semantic).not.toBeVisible();
    let p=await manifest();expect(p.semanticLayerSets[0].layers[0].mask.sha256).toBe(saved.mask.sha256);
    expect(await fs.readFile(path.join(dir,master.file))).toEqual(masterBytes);
    // Reopen the shared workspace; saved vector data remains editable and bound to this exact source.
    await page.getByRole("button",{name:"Character Layers bearbeiten",exact:true}).click();semantic=page.getByRole("dialog",{name:"Character Layers",exact:true});
    await semantic.getByRole("button",{name:"Gemeinsame Auswahlwerkzeuge …",exact:true}).click();editor=page.getByRole("dialog",{name:"Auswahlwerkzeuge",exact:true});
    await editor.getByLabel("Gespeicherte Auswahlen",{exact:true}).selectOption(saved.id);await tool("Auswahl und Pfad laden");await selected(selectedCount);
    expect(await fs.readFile(path.join(dir,saved.mask.file))).toEqual(savedBytes);
    expect(errors).toEqual([]);
    console.log("PASS professional canvas: real common workspace, Magic Wand, four operations, color range, editable closed Bezier area, shapes, twenty-step history, weighted selection/vector persistence, exact mask handoff, immutable source and 960/1280/1920 layout. No generation.");
  }catch(error){if(app){const p=await app.firstWindow();await p.screenshot({path:path.join(screenshots,"professional-failure.png")});console.error((await p.locator("body").innerText()).slice(-4500));}throw error;}
  finally{await app?.close();await fs.rm(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
