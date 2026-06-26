// Client-side "download all files" helper.
//
// The old approach fired a programmatic `a.click()` per file, staggered by a
// fixed timeout. Because the files are cross-origin signed URLs, browsers
// throttle/drop rapid sequential downloads, so only *some* files would land.
//
// Instead we fetch every file as a blob and bundle them into a single ZIP, then
// trigger one same-origin object-URL download — reliable, all-or-nothing, no
// "download multiple files" prompt. JSZip is dynamically imported so it stays
// out of the initial bundle and only loads when the user actually clicks.

type DownloadFile = { name: string; url: string };

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Two attachments can share a filename; keep them distinct inside the zip.
function uniqueName(name: string, used: Set<string>): string {
  const safe = name && name.trim() ? name : "file";
  if (!used.has(safe)) {
    used.add(safe);
    return safe;
  }
  const dot = safe.lastIndexOf(".");
  const base = dot > 0 ? safe.slice(0, dot) : safe;
  const ext = dot > 0 ? safe.slice(dot) : "";
  let i = 2;
  let candidate = `${base} (${i})${ext}`;
  while (used.has(candidate)) {
    i += 1;
    candidate = `${base} (${i})${ext}`;
  }
  used.add(candidate);
  return candidate;
}

async function fetchBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.blob();
}

export type DownloadAllResult = { ok: boolean; failed: string[] };

// Download a list of files. A single file downloads directly; multiple files
// are zipped. Returns which files (if any) could not be fetched.
export async function downloadAllAsZip(
  files: DownloadFile[],
  zipName = "קבצים.zip"
): Promise<DownloadAllResult> {
  if (!files.length) return { ok: true, failed: [] };

  if (files.length === 1) {
    try {
      const blob = await fetchBlob(files[0].url);
      triggerBlobDownload(blob, files[0].name || "file");
      return { ok: true, failed: [] };
    } catch {
      return { ok: false, failed: [files[0].name] };
    }
  }

  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const used = new Set<string>();
  const failed: string[] = [];

  await Promise.all(
    files.map(async (f) => {
      try {
        const blob = await fetchBlob(f.url);
        zip.file(uniqueName(f.name, used), blob);
      } catch {
        failed.push(f.name);
      }
    })
  );

  if (used.size === 0) return { ok: false, failed };

  const out = await zip.generateAsync({ type: "blob" });
  triggerBlobDownload(out, zipName);
  return { ok: failed.length === 0, failed };
}
