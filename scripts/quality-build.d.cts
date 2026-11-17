export function inputHash(root?: string): Promise<string>;
export function hashFile(file: string): Promise<string>;
export function recordBuild(root?: string): Promise<unknown>;
export function reusableBuild(root?: string): Promise<boolean>;
export function locations(root?: string): {
  stamp: string;
  exe: string;
  asar: string;
};
