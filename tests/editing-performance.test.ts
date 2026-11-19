import {expect,it} from "vitest";
import {editingHistory,commitEditing,undoEditing,rangeSelection,emptyPath} from "../src/shared/editing";
it("processes a full 4-MP connected region and retains twenty packed history steps within the stated mask budget",()=>{
 const n=2048*2048,source={width:2048,height:2048,data:new Uint8Array(n*4).fill(255)};
 const started=performance.now();
 const region=rangeSelection(source,{seeds:[0],tolerance:0,connected:true,diagonal:false,alpha:true});
 const fillMs=performance.now()-started;
 expect(region.filter(Boolean)).toHaveLength(n);expect(source.data.every(v=>v===255)).toBe(true);
 let history=editingHistory(new Uint8Array(n));
 const historyStart=performance.now();
 for(let i=0;i<20;i++){const mask=new Uint8Array(history.present.mask);mask[i]=255;history=commitEditing(history,{mask,path:emptyPath()});}
 expect(history.past).toHaveLength(20);
 const packedBytes=history.past.reduce((bytes,s)=>bytes+s.bytes.byteLength,0);
 expect(packedBytes).toBe(10*1024*1024);
 for(let i=0;i<20;i++)history=undoEditing(history);
 expect(history.present.mask.some(Boolean)).toBe(false);
 console.log(JSON.stringify({fixture:"synthetic-2048-square",pixels:n,fillMs:Math.round(fillMs),twentyHistoryAndUndoMs:Math.round(performance.now()-historyStart),packedHistoryBytes:packedBytes,note:"Not a total-process RAM or FPS measurement"}));
},30000);
