/** Verifies elapsed-time semantics without a real 30-minute sleep or provider call.
 * The clock advances >30 min while a real fake Kilo process keeps reporting output.
 * This is not a real-world soak test. */
import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runKiloStreaming } from "../src/autodev/kilo-runner.js";

const fakeKilo = `#!/usr/bin/env node
console.log('session: accelerated-soak');
const pulse=setInterval(()=>console.log('heartbeat'),5);
setTimeout(()=>{clearInterval(pulse);console.log('done');},650);
`;

describe("AutoDev runner: accelerated 30-minute runtime", () => {
  const cleanup: Array<() => void> = [];
  afterEach(() => { while (cleanup.length) cleanup.pop()?.(); });

  it("does not terminate due to total elapsed runtime while fresh output continues", async () => {
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),"autodev-long-runtime-"));
    cleanup.push(()=>fs.rmSync(dir,{recursive:true,force:true}));
    fs.writeFileSync(path.join(dir,"kilo"),fakeKilo,{mode:0o755});
    const oldPath=process.env.PATH;
    process.env.PATH=`${dir}${path.delimiter}${oldPath ?? ""}`;
    cleanup.push(()=>{if(oldPath===undefined) delete process.env.PATH; else process.env.PATH=oldPath;});

    const realNow=Date.now.bind(Date);
    const realStart=realNow();
    const speed=4_000; // 1 ms real time represents 4 seconds of simulated elapsed time.
    const nowSpy=vi.spyOn(Date,"now").mockImplementation(()=>realStart+(realNow()-realStart)*speed);
    cleanup.push(()=>nowSpy.mockRestore());

    const originalInterval=globalThis.setInterval;
    const intervalSpy=vi.spyOn(globalThis,"setInterval").mockImplementation(((fn:(...args:unknown[])=>void,delay?:number,...args:unknown[])=>{
      // Speed up ONLY the runner's 30s watchdog sampling; child process is unaffected.
      return originalInterval(fn,delay===30_000?15:delay,...args);
    }) as typeof setInterval);
    cleanup.push(()=>intervalSpy.mockRestore());

    let maxElapsed=0;
    let samples=0;
    const warnings:number[]=[];
    const result=await runKiloStreaming({
      agent:"laceframe-builder",model:"fake",prompt:"heartbeat-test",
      logPath:path.join(dir,"log.txt"),
      inactivityTimeoutMs:20*60_000,
      onOutput:()=>{},
      onHeartbeat:(_silence,elapsed)=>{maxElapsed=Math.max(maxElapsed,elapsed);samples++;},
      onInactivityWarning:silence=>warnings.push(silence),
      registerCancel:()=>{},
    });
    expect(result.output).toContain("done");
    expect(result.terminatedByInactivity).toBe(false);
    expect(maxElapsed).toBeGreaterThan(30*60_000);
    expect(samples).toBeGreaterThan(0);
    expect(warnings).toHaveLength(0);
  },8_000);
});
