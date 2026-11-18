// Focused PX-01 visual/integrity acceptance. Synthetic images; no generation provider.
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

    const openLayers=async()=>{
      await page.getByRole("button",{name:"Character Layers bearbeiten",exact:true}).click();
      const editor=page.getByRole("dialog",{name:"Character Layers",exact:true});
      await expect(editor.getByLabel("Layername 1",{exact:true})).toBeVisible();
      return editor;
    };
    let editor=await openLayers();
    const canvas=()=>editor.getByLabel("Semantische Layer Bildfläche",{exact:true});
    const count=async()=>Number((await editor.getByRole("status").filter({hasText:"Zugeordnet:"}).innerText()).match(/Zugeordnet: (\d+)/)[1]);
    const point=async(x,y)=>{const b=await canvas().boundingBox();return{x:b.x+x/512*b.width,y:b.y+y/640*b.height};};
    const click=async(x,y)=>{const p=await point(x,y);await page.mouse.click(p.x,p.y);};
    const before=await fs.readFile(path.join(dir,"laceframe.json"));
    expect(await count()).toBe(0);
    await editor.getByLabel("Pinselgröße",{exact:true}).fill("5");
    await click(150,100);
    await expect.poll(count).toBeGreaterThan(0);
    await editor.getByRole("button",{name:"Radierer",exact:true}).click();
    await click(150,100);await expect.poll(count).toBe(0);
    await editor.getByRole("button",{name:"Rückgängig",exact:true}).click();await expect.poll(count).toBeGreaterThan(0);
    await editor.getByRole("button",{name:"Wiederholen",exact:true}).click();await expect.poll(count).toBe(0);
    await editor.getByRole("button",{name:"Flood Fill",exact:true}).click();await click(150,100);
    await expect.poll(count).toBeGreaterThan(10000);
    const hairCount=await count();
    await editor.getByLabel("Gesperrt 1",{exact:true}).check();
    await expect(editor.getByLabel("Layername 1",{exact:true})).toBeDisabled();
    await editor.getByRole("button",{name:"Pinsel",exact:true}).click();await click(160,300);expect(await count()).toBe(hairCount);
    await editor.getByLabel("Sichtbar 1",{exact:true}).uncheck();
    await editor.getByLabel("Sichtbar 1",{exact:true}).check();await editor.getByLabel("Gesperrt 1",{exact:true}).uncheck();
    await editor.getByRole("button",{name:"Haut",exact:true}).click();
    await editor.getByRole("button",{name:"Farbauswahl",exact:true}).click();await click(150,100);
    await expect(editor.getByRole("alert")).toContainText("Layer überlappen");
    await expect(editor.getByRole("button",{name:"Layerrevision speichern",exact:true})).toBeDisabled();
    await editor.getByRole("button",{name:"Rückgängig",exact:true}).click();
    await expect(editor.getByRole("button",{name:"Layerrevision speichern",exact:true})).toBeEnabled();
    await editor.getByRole("button",{name:"Polygon-Lasso",exact:true}).click();
    for(const [x,y] of [[110,280],[180,280],[180,330],[110,330]])await click(x,y);
    await editor.getByRole("button",{name:"Polygon zuweisen",exact:true}).click();await expect.poll(count).toBeGreaterThan(hairCount);
    const baseline=await count();
    await editor.getByRole("button",{name:"Kleidung",exact:true}).click();await editor.getByRole("button",{name:"Pinsel",exact:true}).click();
    await editor.getByLabel("Pinselgröße",{exact:true}).fill("1");
    for(let i=0;i<20;i++)await click(110+i*3+0.5,500.5);
    await expect.poll(count).toBe(baseline+20);
    for(let i=0;i<20;i++)await editor.getByRole("button",{name:"Rückgängig",exact:true}).click();
    expect(await count()).toBe(baseline);
    for(let i=0;i<20;i++)await editor.getByRole("button",{name:"Wiederholen",exact:true}).click();
    expect(await count()).toBe(baseline+20);
    await editor.getByLabel("Layername 1",{exact:true}).fill("Haupthaar");
    const vp=editor.locator(".pixel-camera-viewport"),stage=editor.locator(".pixel-camera-stage");
    const idle=await stage.evaluate(n=>n.style.width);await editor.getByRole("heading",{name:"Character Layers",exact:true}).click();await vp.hover();await page.mouse.wheel(0,-100);expect(await stage.evaluate(n=>n.style.width)).toBe(idle);
    await vp.click({position:{x:20,y:20}});await page.mouse.wheel(0,-100);await expect.poll(()=>stage.evaluate(n=>n.style.width)).not.toBe(idle);
    await editor.getByRole("button",{name:"Verschieben",exact:true}).click();const box=await vp.boundingBox(),left=await stage.evaluate(n=>n.style.left);await page.mouse.move(box.x+50,box.y+50);await page.mouse.down();await page.mouse.move(box.x+80,box.y+70);await page.mouse.up();expect(await stage.evaluate(n=>n.style.left)).not.toBe(left);
    await editor.getByRole("button",{name:"Einpassen",exact:true}).click();
    for(const [width,height] of [[960,720],[1280,800],[1920,1080]]){
      await app.evaluate(({BrowserWindow},s)=>BrowserWindow.getAllWindows()[0].setContentSize(s.width,s.height),{width,height});
      await expect(editor.getByRole("button",{name:"Layerrevision speichern",exact:true})).toBeInViewport();
      await expect.poll(()=>vp.evaluate(n=>n.clientHeight)).toBeGreaterThan(180);
      await page.screenshot({path:path.join(screenshots,`layers-${width}.png`)});
    }
    expect(await fs.readFile(path.join(dir,"laceframe.json"))).toEqual(before);
    await editor.getByRole("button",{name:"Layerrevision speichern",exact:true}).click();await expect(editor).not.toBeVisible();
    let p=await manifest();expect(p.semanticLayerSets).toHaveLength(1);const first=p.semanticLayerSets[0];expect(first.masterId).toBe(master.id);expect(first.layers[0].name).toBe("Haupthaar");
    const firstMasks=await page.evaluate(id=>window.laceframe.semanticLayers(id),first.id);expect(firstMasks.ok).toBe(true);expect(firstMasks.value.layers[0].weights.filter(Boolean).length).toBe(hairCount);
    editor=await openLayers();await editor.getByLabel("Layername 1",{exact:true}).fill("Haupthaar Revision 2");await editor.getByRole("button",{name:"Layerrevision speichern",exact:true}).click();await expect(editor).not.toBeVisible();
    p=await manifest();expect(p.semanticLayerSets).toHaveLength(2);expect(p.semanticLayerSets[0]).toEqual(first);
    editor=await openLayers();await editor.getByLabel("Layerrevision laden",{exact:true}).selectOption(first.id);await expect(editor.getByLabel("Layername 1",{exact:true})).toHaveValue("Haupthaar");
    page.once("dialog",d=>d.accept());await editor.getByRole("button",{name:"Schließen / verwerfen",exact:true}).click();
    expect(await fs.readFile(path.join(dir,master.file))).toEqual(masterBytes);
    const saved=await manifest();await app.close();app=await electron.launch({executablePath:path.resolve("out/Laceframe-linux-x64/laceframe"),args:["--user-data-dir="+path.join(root,"user-data")],env});page=await app.firstWindow();page.setDefaultTimeout(15000);await choose(dir);await page.getByRole("button",{name:/^Projekt öffnen(?: …)?$/}).click();await expect(page.getByRole("heading",{name:"Synthetic Pixel",exact:true})).toBeVisible();expect(await manifest()).toEqual(saved);
    expect(await page.evaluate(()=>({node:typeof window.require,filesystem:"readFile" in window.laceframe}))).toEqual({node:"undefined",filesystem:false});expect(errors).toEqual([]);
    console.log("PASS Semantic Layers: real editor tools, conflicts, twenty-step undo/redo, focused zoom/pan, 960/1280/1920 layouts, immutable Master, exact revision masks, historical load and restart. No generation.");
  }catch(error){if(app){const p=await app.firstWindow();await p.screenshot({path:path.join(screenshots,"failure.png")});console.error((await p.locator("body").innerText()).slice(-2500));}throw error;}
  finally{if(app)await app.close();await fs.rm(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
