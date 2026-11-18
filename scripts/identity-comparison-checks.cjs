/* global module */
const { expect } = require("@playwright/test");
const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");
module.exports = async function checkIdentityComparison({page,app,project}) {
  const manifestPath=path.join(project,"laceframe.json"),before=await fs.readFile(manifestPath),p=JSON.parse(before),candidate=p.masterCandidates.at(-1);
  const source=p.identityAssets.find(a=>!a.removedAt),files=[source.file,candidate.file];
  const hashes=await Promise.all(files.map(async f=>createHash("sha256").update(await fs.readFile(path.join(project,f))).digest("hex")));
  const wrapper=page.locator(".identity-comparison-switch:visible");
  const mode=wrapper.getByLabel("Identitätsvergleich oder Pixelvergleich",{exact:true});
  await expect(mode).toHaveValue("identity");
  const compare=page.locator(".identity-compare"),panes=()=>compare.locator(".identity-viewport");
  await expect(compare.locator(".identity-fit-note")).toContainText("Alpha-Bereich eingepasst");
  await expect(compare).toContainText("3024 × 4032 Pixel");
  await expect(compare).toContainText("1254 × 1254 Pixel");
  await expect(compare).toContainText("1024 × 1024 Pixel");
  const scale=async index=>Number(await panes().nth(index).getAttribute("data-scale"));
  const rect=async index=>JSON.parse(await panes().nth(index).getAttribute("data-region"));
  const transform=async index=>panes().nth(index).locator("img").evaluate(img=>window.getComputedStyle(img).transform);
  expect((await rect(1)).width).toBeLessThan(1254);
  const otherScale=await scale(1);
  await compare.getByRole("button",{name:"Identitätsreferenz vergrößern",exact:true}).click();
  expect(await scale(1)).toBe(otherScale);
  const a=compare.getByRole("region",{name:"Identitätsreferenz Bildansicht"});
  for(const n of [100,200,400]){await a.getByRole("button",{name:`${n}%`,exact:true}).click();await expect.poll(()=>scale(0)).toBe(n/100);}
  await a.getByRole("button",{name:"Einpassen",exact:true}).click();
  await compare.getByLabel("Zoom/Pan synchronisieren",{exact:true}).check();
  const oldA=await scale(0),oldB=await scale(1);
  await compare.getByRole("button",{name:"Identitätsreferenz vergrößern",exact:true}).click();
  await expect.poll(async()=> (await scale(1))/oldB).toBeCloseTo((await scale(0))/oldA,3);
  await compare.getByLabel("Zoom/Pan synchronisieren",{exact:true}).uncheck();
  await panes().first().scrollIntoViewIfNeeded();
  let box=await panes().first().boundingBox(),candidateBefore=await transform(1);
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+30,box.y+box.height/2+20);await page.mouse.up();
  expect(await transform(1)).toBe(candidateBefore);
  await compare.getByLabel("Zoom/Pan synchronisieren",{exact:true}).check();
  const linkedBefore=await transform(1);
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+20,box.y+box.height/2+10);await page.mouse.up();
  await expect.poll(()=>transform(1)).not.toBe(linkedBefore);
  await compare.getByLabel("Zoom/Pan synchronisieren",{exact:true}).uncheck();
  await compare.getByRole("button",{name:"Identitätsreferenz Hand-Werkzeug",exact:true}).click();
  await panes().first().focus();await page.keyboard.down("Space");
  const panBefore=await transform(0);await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+15,box.y+box.height/2);await page.mouse.up();await page.keyboard.up("Space");
  expect(await transform(0)).not.toBe(panBefore);
  // Wheel zoom keeps the exact image point below the cursor, in CSS coordinates.
  const sample=()=>panes().first().evaluate(el=>{const r=el.getBoundingClientRect(),m=new window.DOMMatrix(window.getComputedStyle(el.querySelector("img")).transform);return {point:{x:r.width*.4,y:r.height*.45},x:m.e,y:m.f,scale:m.a};});
  await panes().first().evaluate(el=>el.addEventListener("wheel",e=>{
    const r=el.getBoundingClientRect();el.dataset.wheelPoint=JSON.stringify({x:e.clientX-r.left,y:e.clientY-r.top});
  },{once:true}));
  const anchor=await sample();box=await panes().first().boundingBox();
  await page.mouse.move(box.x+anchor.point.x,box.y+anchor.point.y);await page.mouse.wheel(0,-120);
  await expect.poll(()=>scale(0)).toBeGreaterThan(anchor.scale);
  const after=await sample();
  const actualPoint=JSON.parse(await panes().first().getAttribute("data-wheel-point"));
  expect(after.x+(actualPoint.x-anchor.x)/anchor.scale*after.scale).toBeCloseTo(actualPoint.x,2);
  expect(after.y+(actualPoint.y-anchor.y)/anchor.scale*after.scale).toBeCloseTo(actualPoint.y,2);
  await compare.getByLabel("Sichtbare Figur einpassen",{exact:true}).uncheck();expect((await rect(1)).width).toBe(1254);
  await compare.getByLabel("Sichtbare Figur einpassen",{exact:true}).check();expect((await rect(1)).width).toBeLessThan(1254);
  const cdp=await page.context().newCDPSession(page);
  await cdp.send("Emulation.setDeviceMetricsOverride",{width:960,height:720,deviceScaleFactor:2,mobile:false});
  await expect.poll(()=>page.evaluate(()=>window.devicePixelRatio)).toBe(2);
  await panes().last().focus();await panes().last().press("ArrowLeft");
  await expect(panes().last().locator("img")).toBeVisible();
  await cdp.send("Emulation.clearDeviceMetricsOverride");await cdp.detach();
  await mode.selectOption("pixel");
  await expect(wrapper.getByRole("slider",{name:"Before/After-Vergleich",exact:true})).toBeVisible();
  await expect(wrapper.getByLabel("Vergleichsregistrierung",{exact:true})).toHaveValue("native");
  const stage=wrapper.locator(".compare-stage");expect(await stage.evaluate(el=>[el.style.width,el.style.height])).toEqual(["3024px","4032px"]);
  await wrapper.getByRole("slider",{name:"Before/After-Vergleich",exact:true}).press("End");
  await expect(wrapper.getByRole("slider",{name:"Before/After-Vergleich",exact:true})).toHaveAttribute("aria-valuenow","100");
  await wrapper.getByLabel("Create Zoom",{exact:true}).selectOption("200");expect(Number(await stage.getAttribute("data-scale"))).toBe(2);
  const viewport=wrapper.locator(".compare-viewport");await viewport.scrollIntoViewIfNeeded();box=await viewport.boundingBox();
  const pixelBefore=await stage.evaluate(el=>{const m=new window.DOMMatrix(window.getComputedStyle(el).transform);return {x:m.e,y:m.f,scale:m.a};});
  await viewport.evaluate(el=>el.addEventListener("wheel",e=>{const r=el.getBoundingClientRect();el.dataset.wheelPoint=JSON.stringify({x:e.clientX-r.left-el.clientLeft,y:e.clientY-r.top-el.clientTop});},{once:true}));
  await page.mouse.move(box.x+30,box.y+30);await page.mouse.wheel(0,-100);await expect.poll(async()=>Number(await stage.getAttribute("data-scale"))).toBeGreaterThan(2);
  const pixelAfter=await stage.evaluate(el=>{const m=new window.DOMMatrix(window.getComputedStyle(el).transform);return {x:m.e,y:m.f,scale:m.a};}),pixelPoint=JSON.parse(await viewport.getAttribute("data-wheel-point"));
  expect(pixelAfter.x+(pixelPoint.x-pixelBefore.x)/pixelBefore.scale*pixelAfter.scale).toBeCloseTo(pixelPoint.x,2);
  expect(pixelAfter.y+(pixelPoint.y-pixelBefore.y)/pixelBefore.scale*pixelAfter.scale).toBeCloseTo(pixelPoint.y,2);
  await wrapper.getByLabel("Vergleichsmodus",{exact:true}).selectOption("overlay");await wrapper.getByLabel("Overlay-Deckkraft",{exact:true}).fill("35");
  await mode.selectOption("identity");
  await expect(compare.locator(".identity-fit-note")).toContainText("Alpha-Bereich eingepasst");
  await fs.mkdir("artifacts",{recursive:true});
  for(const [width,height] of [[960,720],[1920,1080]]){
    await app.evaluate(({BrowserWindow},{width,height})=>BrowserWindow.getAllWindows()[0].setSize(width,height),{width,height});
    await compare.getByRole("button",{name:"Ansicht zurücksetzen",exact:true}).click();
    await compare.scrollIntoViewIfNeeded();
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
    for(let i=0;i<2;i++){
      await expect(panes().nth(i).locator("img")).toBeVisible();
      const bounds=await panes().nth(i).boundingBox();expect(bounds.width).toBeGreaterThan(100);
    }
    await page.screenshot({path:`artifacts/identity-comparison-${width}.png`});
  }
  expect(await fs.readFile(manifestPath)).toEqual(before);
  expect(await Promise.all(files.map(async f=>createHash("sha256").update(await fs.readFile(path.join(project,f))).digest("hex")))).toEqual(hashes);
  console.log("PASS identity comparison: actual 3024x4032 reference/1254x1254 candidate/1024 target, alpha worker, independent/linked views, exact presets, cursor wheel, hand/Space pan, HiDPI 2x, resize, native pixel slider/overlay, immutable manifest/source hashes and 960/1920 screenshots.");
};
