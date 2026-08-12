// ===== Doraemocks bulk lecture extractor v4 (resumable) =====
// Run this in Chrome DevTools Console while you are on
// https://cds.streamfiles.eu.org  (any page is fine, just needs to load once
// so Cloudflare's clearance cookie is set in your browser).
//
// RESUMABLE: progress is saved to localStorage as it goes. If the run
// gets interrupted (tab closed, network drop, phone locks), just paste
// the SAME line again — it picks up where it left off instead of
// starting over. Once every subject is done, it downloads lecture.json
// and clears the saved progress.

const STORAGE_KEY = 'doraemocks_extract_progress_v1';

(async () => {
  function decodeJwtPayload(token) {
    const part = token.split('.')[1];
    const base64 = part.replace(/-/g,'+').replace(/_/g,'/');
    const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
    const raw = atob(padded);
    const json = decodeURIComponent(
      raw.split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
    );
    return JSON.parse(json);
  }

  function extractZoomUrl(redirectPath) {
    const qs = redirectPath.slice(redirectPath.indexOf('?') + 1);
    const token = new URLSearchParams(qs).get('token');
    if (!token) return null;
    const payload = decodeJwtPayload(token);
    return payload && payload.url ? payload.url : null;
  }

  console.log('Fetching fresh batch list…');
  const batchesRes = await fetch('/api.php?action=batches&page=1&limit=50');
  const batchesData = await batchesRes.json();
  const batches = batchesData.batches || [];
  console.log(`Got ${batches.length} batches.`);

  const SUBJECTS = [];
  for (const b of batches) {
    for (const s of (b.subjects || [])) {
      SUBJECTS.push({ id: s.id, title: s.title, batch: b.title });
    }
  }
  console.log(`Found ${SUBJECTS.length} subjects total.`);

  // Load any saved progress from a previous run
  let result = {};
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      result = JSON.parse(saved);
      const already = Object.keys(result).filter(k => result[k] && result[k].lectures && !result[k].error).length;
      console.log(`%cResuming — ${already} subjects already done from a previous run.`, 'color: #c7a034; font-weight: bold;');
    }
  } catch(e) {}

  let done = Object.keys(result).length;
  let processedThisRun = 0;

  for (const subj of SUBJECTS) {
    const existing = result[subj.id];
    // Skip subjects already fetched successfully; retry ones that errored or are missing
    if (existing && existing.lectures && !existing.error) continue;

    try {
      const res = await fetch(`/api.php?action=subject&token=${encodeURIComponent(subj.id)}`);
      const data = await res.json();
      const lectures = (data.folder_data && data.folder_data.lectures) || [];
      result[subj.id] = {
        title: subj.title,
        batch: subj.batch,
        lectures: lectures.map(lec => {
          let zoomUrl = null;
          try { zoomUrl = extractZoomUrl(lec.url || ''); } catch(e) {}
          return { title: lec.title, url: zoomUrl };
        })
      };
    } catch (e) {
      result[subj.id] = { title: subj.title, batch: subj.batch, error: String(e) };
    }

    processedThisRun++;
    done = Object.keys(result).length;
    console.log(`[${done}/${SUBJECTS.length}] ${subj.title} — ${result[subj.id].lectures ? result[subj.id].lectures.length : 0} lectures`);

    // Save progress after every subject so nothing is lost if interrupted
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(result)); } catch(e) {
      console.log('Warning: could not save progress to localStorage (storage full?). Continuing anyway.');
    }

    await new Promise(r => setTimeout(r, 300)); // be polite, don't hammer the server
  }

  const stillMissing = SUBJECTS.filter(s => !result[s.id] || result[s.id].error).length;
  if (stillMissing > 0) {
    console.log(`%c${stillMissing} subjects still failed after this run. Run the script again to retry just those.`, 'color: orange; font-weight: bold;');
  }

  const finalJson = JSON.stringify(result);
  console.log('DONE. Total size:', finalJson.length, 'characters. Processed this run:', processedThisRun);

  // Trigger a real file download — no clipboard/paste needed
  const blob = new Blob([finalJson], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'lecture.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  // Only clear saved progress once everything succeeded
  if (stillMissing === 0) {
    localStorage.removeItem(STORAGE_KEY);
    console.log('%cAll subjects done — download started, progress cleared.', 'color: green; font-weight: bold;');
  } else {
    console.log('%cDownload started with partial data — progress KEPT so next run resumes.', 'color: green; font-weight: bold;');
  }
})();
