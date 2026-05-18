import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface TmpHome {
  dir: string;
  cleanup: () => void;
}

export function makeTmpHome(): TmpHome {
  const dir = mkdtempSync(join(tmpdir(), "ob-cli-test-"));
  return {
    dir,
    cleanup: () => {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
