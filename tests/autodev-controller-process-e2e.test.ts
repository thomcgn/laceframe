/**
 * Issue #39: controller end-to-end checks in a separate OS process.
 * NEVER imports AutodevController into the Vitest worker: controller Git
 * operations inherit cwd, so each child must start in an isolated Git repo.
 * These tests intentionally do not replace long-running clock/inactivity tests.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "src/autodev/cli.ts");
const tsx = path.join(root, "node_modules/.bin/tsx");

const kilo = `#!/usr/bin/env node
const fs=require('node:fs');
const path=require('node:path');
const args=process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_KILO_CALLS, JSON.stringify(args)+'\\n');
console.log('session: isolated-session-39');
if(process.env.FAKE_KILO_MODE==='429'){
  console.error('Error: Free model usage limit reached. Retry-After: 2');
  process.exit(1);
}
if(process.env.FAKE_KILO_MODE==='503'){
  console.error('Error: 503 Service Unavailable');
  process.exit(1);
}
if(process.env.FAKE_KILO_MODE==='hang'){
  setInterval(()=>{},1000);
}
if(args.includes('laceframe-reviewer')){
  const status=process.env.FAKE_REVIEW_STATUS || 'PASS';
  fs.mkdirSync('docs/reviews',{recursive:true});
  fs.writeFileSync('docs/reviews/LATEST_REVIEW.md','## Status\\n'+status+'\\nBLOCKERS: '+(status==='PASS'?'0':'1')+'\\n');
} else {
  fs.writeFileSync('builder-change.txt','deterministic implementation\\n');
}
`;
const gh = `#!/usr/bin/env node
const fs=require('node:fs');
const args=process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_GH_CALLS,JSON.stringify(args)+'\\n');
if(args[0]==='auth') process.exit(0);
if(args[0]==='issue' && args[1]==='list') {
  console.log(JSON.stringify([{number:39,title:'Isolated task',body:'Priority: high',state:'OPEN',labels:[{name:'autodev:approved'}]}]));
} else if(args[0]==='issue' && args[1]==='view') {
  console.log(JSON.stringify({state:'OPEN',labels:[{name:'autodev:approved'}]}));
}
`;

type Fixture = { dir: string; repo: string; bin: string; env: NodeJS.ProcessEnv };
function git(repo:string, ...args:string[]):string {
  return execFileSync("git",args,{cwd:repo,encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();
}
function makeFixture():Fixture {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"autodev-process-e2e-"));
  const repo=path.join(dir,"repo");
  const bin=path.join(dir,"bin");
  fs.mkdirSync(repo); fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin,"kilo"),kilo,{mode:0o755});
  fs.writeFileSync(path.join(bin,"gh"),gh,{mode:0o755});
  git(repo,"init","-b","develop");
  git(repo,"config","user.email","autodev-fixture@example.invalid");
  git(repo,"config","user.name","AutoDev Fixture");
  const bare=path.join(dir,"origin.git");
  execFileSync("git",["init","--bare",bare],{stdio:"ignore"});
  git(repo,"remote","add","origin",bare);
  fs.writeFileSync(path.join(repo,".gitignore"),".autodev-state.json\n.autodev-checkpoint.json\n.autodev-free-budget.json\n.autodev-controller.lock/\nlogs/\n");
  fs.writeFileSync(path.join(repo,"README.md"),"fixture\n");
  const config={repo:"fake/isolated",branch:"develop",labels:{approved:"autodev:approved",inProgress:"autodev:in-progress",review:"autodev:review",blocked:"autodev:blocked",implemented:"autodev:implemented"},maxReviewIterations:3,qualityGates:[],smokeTests:[],kilo:{builderAgent:"laceframe-builder",reviewerAgent:"laceframe-reviewer",model:"fake",inactivityTimeoutMs:30000,sessionResume:true},freeBudget:{windowMinutes:60,limit:200,warningAt:160,pauseAt:190,estimatedRequestsPerTask:1,cooldownMinutes:1}};
  fs.writeFileSync(path.join(repo,".autodev-config.json"),JSON.stringify(config));
  git(repo,"add","README.md",".gitignore",".autodev-config.json");
  git(repo,"commit","-m","fixture baseline");
  git(repo,"push","-u","origin","develop");
  return {dir,repo,bin,env:{...process.env,PATH:`${bin}${path.delimiter}${process.env.PATH ?? ""}`,AUTODEV_BASE_DIR:repo,FAKE_KILO_CALLS:path.join(dir,"kilo-calls.jsonl"),FAKE_GH_CALLS:path.join(dir,"gh-calls.jsonl")}};
}

async function execute(f:Fixture, overrides:Record<string,string>={}):Promise<{code:number|null,stdout:string,stderr:string}> {
  return await new Promise((resolve,reject)=>{
    const child=spawn(tsx,[cli,"run","--execute"],{cwd:f.repo,env:{...f.env,...overrides},stdio:["ignore","pipe","pipe"],detached:process.platform!=="win32"});
    let stdout="",stderr="";
    child.stdout.on("data",b=>{stdout+=String(b);});
    child.stderr.on("data",b=>{stderr+=String(b);});
    let timedOut=false;
    const timer=setTimeout(()=>{
      timedOut=true;
      try {if(process.platform!=="win32" && child.pid) process.kill(-child.pid,"SIGKILL"); else child.kill("SIGKILL");}catch{/* already exited */}
    },12000);
    child.once("error",e=>{clearTimeout(timer);reject(e);});
    child.once("close",code=>{
      clearTimeout(timer);
      if(timedOut) reject(new Error(`Fixture child timed out. stdout=${stdout.slice(-1500)} stderr=${stderr.slice(-1500)}`));
      else resolve({code,stdout,stderr});
    });
  });
}
async function interrupted(f:Fixture):Promise<{code:number|null;stdout:string;stderr:string}> {
  return await new Promise((resolve,reject)=>{
    const child=spawn(tsx,[cli,"run","--execute"],{
      cwd:f.repo,env:{...f.env,FAKE_KILO_MODE:"hang"},stdio:["ignore","pipe","pipe"],
      detached:process.platform!=="win32",
    });
    let stdout="",stderr="",sent=false,closed=false;
    child.stdout.on("data",b=>{stdout+=String(b);});
    child.stderr.on("data",b=>{stderr+=String(b);});
    const poll=setInterval(()=>{
      if(sent||!fs.existsSync(f.env.FAKE_KILO_CALLS!))return;
      if(!fs.readFileSync(f.env.FAKE_KILO_CALLS!,"utf8").trim())return;
      const cpFile=path.join(f.repo,".autodev-checkpoint.json");
      if(!fs.existsSync(cpFile))return;
      try{if(json<{sessionId:string|null}>(cpFile).sessionId!=="isolated-session-39")return;}catch{return;}
      sent=true;
      child.kill("SIGINT");
    },25);
    const timer=setTimeout(()=>{
      if(closed)return;
      try{if(process.platform!=="win32"&&child.pid)process.kill(-child.pid,"SIGKILL");else child.kill("SIGKILL");}catch{/*child exited*/}
    },8000);
    child.once("error",e=>{closed=true;clearInterval(poll);clearTimeout(timer);reject(e);});
    child.once("close",code=>{
      closed=true;clearInterval(poll);clearTimeout(timer);
      if(!sent)reject(new Error(`SIGINT fixture never started Kilo. ${stdout.slice(-500)} ${stderr.slice(-500)}`));
      else resolve({code,stdout,stderr});
    });
  });
}
function json<T>(p:string):T { return JSON.parse(fs.readFileSync(p,"utf8")) as T; }
function calls(p:string):string[][] {
  return fs.existsSync(p)?fs.readFileSync(p,"utf8").trim().split("\n").filter(Boolean).map(s=>JSON.parse(s) as string[]):[];
}

describe("AutoDev controller isolated process E2E",()=>{
  let f:Fixture;
  beforeEach(()=>{f=makeFixture();});
  afterEach(()=>{fs.rmSync(f.dir,{recursive:true,force:true});});

  it("preserves a 429 checkpoint, session ID and cooldown without publishing",async()=>{
    const r=await execute(f,{FAKE_KILO_MODE:"429"});
    expect(r.stdout+r.stderr).toMatch(/RATE LIMIT PAUSE/i);
    const cp=json<{issueNumber:number;sessionId:string;reason:string}>(path.join(f.repo,".autodev-checkpoint.json"));
    expect(cp).toMatchObject({issueNumber:39,sessionId:"isolated-session-39",reason:"rate-limit"});
    const state=json<{currentIssue:number;checkpoint:{sessionId:string}}>(path.join(f.repo,".autodev-state.json"));
    expect(state.currentIssue).toBe(39);
    expect(state.checkpoint.sessionId).toBe("isolated-session-39");
    const budget=json<{cooldownUntil:number}>(path.join(f.repo,".autodev-free-budget.json"));
    expect(budget.cooldownUntil).toBeGreaterThan(Date.now());
    expect(calls(f.env.FAKE_GH_CALLS!).flat()).not.toContain("close");
    expect(git(f.repo,"status","--porcelain")).toBe("");
  },20000);

  it("fail-closes on checkpoint/HEAD drift without invoking Kilo",async()=>{
    const original=git(f.repo,"rev-parse","HEAD");
    const cp={issueNumber:39,reviewIteration:1,phase:"builder",sessionId:"isolated-session-39",kiloAgent:"builder",prompt:"continue",timestamp:new Date().toISOString(),reason:"signal",gitStatus:"",headCommit:original};
    fs.writeFileSync(path.join(f.repo,".autodev-state.json"),JSON.stringify({currentIssue:39,reviewIteration:1,lastProcessedIssue:null,processedIssues:[],failedIssues:[],dryRun:false,lastRun:null,checkpoint:cp}));
    fs.writeFileSync(path.join(f.repo,".autodev-checkpoint.json"),JSON.stringify(cp));
    fs.writeFileSync(path.join(f.repo,"unreviewed.txt"),"must survive\n");
    const r=await execute(f);
    expect(r.code).not.toBe(0);
    expect(r.stdout+r.stderr).toMatch(/NEEDS_RECONCILIATION/);
    expect(fs.readFileSync(path.join(f.repo,"unreviewed.txt"),"utf8")).toBe("must survive\n");
    expect(calls(f.env.FAKE_KILO_CALLS!)).toHaveLength(0);
    expect(fs.existsSync(path.join(f.repo,".autodev-checkpoint.json"))).toBe(true);
  },20000);

  it("publishes only when the separate reviewer reports PASS with zero blockers",async()=>{
    const r=await execute(f,{FAKE_REVIEW_STATUS:"PASS"});
    expect(r.code).toBe(0);
    const actions=calls(f.env.FAKE_GH_CALLS!);
    expect(actions.some(a=>a[0]==="issue" && a[1]==="close")).toBe(true);
    expect(git(f.repo,"show","HEAD:builder-change.txt")).toContain("deterministic implementation");
    const state=json<{processedIssues:number[]}>(path.join(f.repo,".autodev-state.json"));
    expect(state.processedIssues).toContain(39);
  },20000);

  it("restarts an existing 429 checkpoint only after cooldown and passes the original --session ID",async()=>{
    const first=await execute(f,{FAKE_KILO_MODE:"429"});
    expect(first.stdout+first.stderr).toMatch(/RATE LIMIT PAUSE/i);
    const cpPath=path.join(f.repo,".autodev-checkpoint.json");
    const cp=json<{sessionId:string;reason:string}>(cpPath);
    expect(cp).toMatchObject({sessionId:"isolated-session-39",reason:"rate-limit"});
    const before=calls(f.env.FAKE_KILO_CALLS!).length;
    // Simulate the passage of the provider's cooldown without sleeping.
    const budgetPath=path.join(f.repo,".autodev-free-budget.json");
    const budget=json<{version:number;reservations:unknown[];cooldownUntil:number;pauseReason:string}>(budgetPath);
    budget.cooldownUntil=Date.now()-1000;
    budget.pauseReason="";
    budget.reservations=[];
    fs.writeFileSync(budgetPath,JSON.stringify(budget));
    const resumed=await execute(f,{FAKE_REVIEW_STATUS:"PASS"});
    expect(resumed.code).toBe(0);
    expect(calls(f.env.FAKE_KILO_CALLS!).length).toBeGreaterThan(before);
    const builderCall=calls(f.env.FAKE_KILO_CALLS!)[before];
    expect(builderCall).toContain("--session");
    expect(builderCall[builderCall.indexOf("--session")+1]).toBe("isolated-session-39");
    expect(calls(f.env.FAKE_GH_CALLS!).some(a=>a[0]==="issue"&&a[1]==="close")).toBe(true);
  },20000);

  it("marks an actual silent Kilo process as inactivity, persists its checkpoint and terminates the child",async()=>{
    // Preload only in the fixture controller process. Speed up the watchdog
    // sampling and monotonic wall-clock representation; do not modify real repo.
    const preload=path.join(f.dir,"accelerated-clock.cjs");
    fs.writeFileSync(preload,`const real=Date.now.bind(Date);const start=real();
Date.now=()=>start+(real()-start)*3000;
const interval=global.setInterval;
global.setInterval=function(fn,ms,...args){return interval(fn,ms===30000?10:ms,...args);};
`);
    const configPath=path.join(f.repo,".autodev-config.json");
    const config=json<{kilo:{inactivityTimeoutMs:number}}>(configPath);
    config.kilo.inactivityTimeoutMs=150000;
    fs.writeFileSync(configPath,JSON.stringify(config));
    git(f.repo,"add",".autodev-config.json");
    git(f.repo,"commit","-m","Configure accelerated inactivity fixture");
    git(f.repo,"push","origin","develop");
    // Fixture remains clean; checkpoint captures this exact HEAD.
    const r=await execute(f,{FAKE_KILO_MODE:"hang",NODE_OPTIONS:`--require=${preload}`});
    expect(r.code).not.toBe(0);
    expect(r.stdout+r.stderr).toMatch(/terminated by inactivity/i);
    const cp=json<{sessionId:string;reason:string}>(path.join(f.repo,".autodev-checkpoint.json"));
    expect(cp).toMatchObject({sessionId:"isolated-session-39",reason:"inactivity"});
    expect(calls(f.env.FAKE_KILO_CALLS!)).toHaveLength(1);
    expect(calls(f.env.FAKE_GH_CALLS!).some(a=>a[0]==="issue"&&a[1]==="close")).toBe(false);
  },20000);

  it("preserves interrupted work and checkpoint on SIGINT, without publishing",async()=>{
    const r=await interrupted(f);
    expect(r.code).not.toBe(0);
    const cp=json<{reason:string;sessionId:string}>(path.join(f.repo,".autodev-checkpoint.json"));
    expect(cp).toMatchObject({reason:"signal",sessionId:"isolated-session-39"});
    expect(fs.readFileSync(path.join(f.repo,"builder-change.txt"),"utf8")).toContain("deterministic implementation");
    expect(calls(f.env.FAKE_GH_CALLS!).some(a=>a[0]==="issue"&&a[1]==="close")).toBe(false);
  },20000);

  it("fails closed after 503, retaining the checkpoint and never blindly spawning a second builder",async()=>{
    const r=await execute(f,{FAKE_KILO_MODE:"503"});
    expect(r.code).not.toBe(0);
    expect(r.stdout+r.stderr).toMatch(/503|Service Unavailable/);
    const checkpoint=json<{sessionId:string;issueNumber:number}>(path.join(f.repo,".autodev-checkpoint.json"));
    expect(checkpoint).toMatchObject({issueNumber:39,sessionId:"isolated-session-39"});
    expect(calls(f.env.FAKE_KILO_CALLS!)).toHaveLength(1);
    expect(calls(f.env.FAKE_GH_CALLS!).some(a=>a[0]==="issue"&&a[1]==="close")).toBe(false);
  },20000);

  it("refuses to resume when a checkpoint has no session ID, without touching the worktree",async()=>{
    const original=git(f.repo,"rev-parse","HEAD");
    const cp={issueNumber:39,reviewIteration:1,phase:"builder",sessionId:null,kiloAgent:"builder",prompt:"continue",timestamp:new Date().toISOString(),reason:"signal",gitStatus:"",headCommit:original};
    fs.writeFileSync(path.join(f.repo,".autodev-state.json"),JSON.stringify({currentIssue:39,reviewIteration:1,lastProcessedIssue:null,processedIssues:[],failedIssues:[],dryRun:false,lastRun:null,checkpoint:cp}));
    fs.writeFileSync(path.join(f.repo,".autodev-checkpoint.json"),JSON.stringify(cp));
    const r=await execute(f);
    expect(r.code).not.toBe(0);
    expect(r.stdout+r.stderr).toMatch(/NEEDS_RECONCILIATION/);
    expect(calls(f.env.FAKE_KILO_CALLS!)).toHaveLength(0);
    expect(fs.existsSync(path.join(f.repo,".autodev-checkpoint.json"))).toBe(true);
    expect(git(f.repo,"rev-parse","HEAD")).toBe(original);
  },20000);

  it("clears the checkpoint only after a complete PASS/review/publish cycle",async()=>{
    const r=await execute(f,{FAKE_REVIEW_STATUS:"PASS"});
    expect(r.code).toBe(0);
    expect(fs.existsSync(path.join(f.repo,".autodev-checkpoint.json"))).toBe(false);
    const state=json<{currentIssue:number|null;checkpoint:unknown;processedIssues:number[]}>(path.join(f.repo,".autodev-state.json"));
    expect(state.currentIssue).toBeNull();
    expect(state.checkpoint).toBeNull();
    expect(state.processedIssues).toContain(39);
  },20000);

  it("does not close or push when the reviewer reports FAIL",async()=>{
    const head=git(f.repo,"rev-parse","HEAD");
    await execute(f,{FAKE_REVIEW_STATUS:"FAIL"});
    expect(calls(f.env.FAKE_GH_CALLS!).some(a=>a[0]==="issue" && a[1]==="close")).toBe(false);
    expect(git(f.repo,"rev-parse","HEAD")).toBe(head);
    expect(git(f.repo,"rev-parse","origin/develop")).toBe(head);
    expect(fs.existsSync(path.join(f.repo,"builder-change.txt"))).toBe(true);
  },20000);
});
