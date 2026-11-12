import { useRef, useState } from "react";
import { storage } from "../storage";
import { isTauriRuntime } from "../../app/runtime";
import { exportBackup, restoreBackup } from "./backup";

export default function BackupPanel({ onRestore }: { onRestore: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try { await action(); } catch (error) { setMessage(error instanceof Error ? error.message : "Backup operation failed."); }
    finally { setBusy(false); }
  };
  const save = () => run(async () => {
    const bytes = await exportBackup(storage);
    const name = `ZRead-${new Date().toISOString().slice(0, 10)}.zreadbackup`;
    if (isTauriRuntime) {
      const [{ save }, { writeFile }] = await Promise.all([import("@tauri-apps/plugin-dialog"), import("@tauri-apps/plugin-fs")]);
      const path = await save({ defaultPath: name, filters: [{ name: "ZRead backup", extensions: ["zreadbackup"] }] });
      if (!path) return;
      await writeFile(path, bytes);
    } else {
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/zip" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    setMessage("Backup exported with EPUBs, progress, highlights, vocabulary and settings.");
  });
  const restore = (bytes: ArrayBuffer) => run(async () => {
    const count = await restoreBackup(bytes, storage);
    setMessage(`Restored ${count} books as new copies. Your existing books were kept.`);
    onRestore();
  });
  const chooseRestore = () => {
    if (!isTauriRuntime) { input.current?.click(); return; }
    void run(async () => {
      const [{ open }, { readFile }] = await Promise.all([import("@tauri-apps/plugin-dialog"), import("@tauri-apps/plugin-fs")]);
      const path = await open({ multiple: false, filters: [{ name: "ZRead backup", extensions: ["zreadbackup"] }] });
      if (!path) return;
      const bytes = await readFile(path);
      const count = await restoreBackup(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), storage);
      setMessage(`Restored ${count} books as new copies. Your existing books were kept.`);
      onRestore();
    });
  };
  return <section className="mt-10 border-t border-black/10 dark:border-white/10 pt-6 text-xs" aria-label="Backup and restore">
    <h2 className="font-semibold mb-2">Backup and restore</h2>
    <p className="opacity-70 mb-3">Backups include your EPUB files and reading data. Restoring adds new copies and applies the saved reader settings.</p>
    <div className="flex gap-3">
      <button className="border rounded-sm px-3 py-2" disabled={busy} onClick={save}>Export backup</button>
      <button className="border rounded-sm px-3 py-2" disabled={busy} onClick={chooseRestore}>Restore backup</button>
    </div>
    <input ref={input} type="file" accept=".zreadbackup" hidden onChange={async e => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (file) await restore(await file.arrayBuffer());
    }} />
    <p role="status" className="mt-2">{busy ? "Working…" : message}</p>
  </section>;
}
