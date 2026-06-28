import { planTransfer, runTransfer } from "./syncEngine";
import { DEFAULT_IGNORE, FileEntry, TransferDirection, Transferer, TransferSummary } from "./types";

export interface TransferContext {
  excludeConfig: boolean;
  localEntries: FileEntry[];
  remoteEntries: FileEntry[];
  sizesFor: (entries: FileEntry[]) => Map<string, number>;
  makeTransferer: (direction: TransferDirection) => Transferer;
  onProgress: (done: number, total: number, label: string) => void;
}

export async function executeTransfer(direction: TransferDirection, ctx: TransferContext): Promise<TransferSummary> {
  const ignore = ctx.excludeConfig ? [...DEFAULT_IGNORE, "server.properties"] : DEFAULT_IGNORE;

  const source = direction === "PUSH" ? ctx.localEntries : ctx.remoteEntries;
  const dest = direction === "PUSH" ? ctx.remoteEntries : ctx.localEntries;

  const plan = planTransfer(source, dest, ignore);
  const sizes = ctx.sizesFor(source);
  const transferer = ctx.makeTransferer(direction);

  return runTransfer(plan, transferer, sizes, ctx.onProgress);
}
