/* global module */
// Real shared-selection/host adapter exercise. No file writes, test-provider calls or DOM state injection.
const {expect}=require("@playwright/test");
module.exports=async function checkSharedHandoff(page,host,canvas,undoName){
 const read=()=>canvas.evaluate(c=>Array.from(c.getContext("2d").getImageData(0,0,c.width,c.height).data).join(","));
 const before=await read();
 await host.getByRole("button",{name:"Gemeinsame Auswahlwerkzeuge …",exact:true}).click();
 const selection=page.getByRole("dialog",{name:"Auswahlwerkzeuge",exact:true});
 await expect(selection.getByLabel("Interaktive Auswahlfläche",{exact:true})).toBeVisible();
 await expect(host).toBeHidden();
 await selection.getByRole("button",{name:"Alles auswählen",exact:true}).click();
 await selection.getByRole("button",{name:"Auswahl als Maske übernehmen",exact:true}).click();
 await expect(selection).not.toBeVisible();await expect(host).toBeVisible();
 await expect.poll(read).not.toBe(before);
 await host.getByRole("button",{name:undoName,exact:true}).click();
 await expect.poll(read).toBe(before);
};
