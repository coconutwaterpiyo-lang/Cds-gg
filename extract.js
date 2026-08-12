// ===== Doraemocks bulk lecture extractor v2 =====
// Run this in Chrome DevTools Console while you are on
// https://cds.streamfiles.eu.org  (any page is fine, just needs to load once
// so Cloudflare's clearance cookie is set in your browser).
//
// This version fetches a FRESH batches+subjects list first (so tokens can't
// be expired), then walks every subject to pull lecture data and decode the
// real Zoom links. Result is copied to your clipboard as JSON.

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
  console.log(`Found ${SUBJECTS.length} subjects total. Starting lecture fetch…`);

  const result = {};
  let done = 0;

  for (const subj of SUBJECTS) {
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
          return {
            title: lec.title,
            url: zoomUrl,
            start_date: lec.start_date || null
          };
        })
      };
    } catch (e) {
      result[subj.id] = { title: subj.title, batch: subj.batch, error: String(e) };
    }
    done++;
    console.log(`[${done}/${SUBJECTS.length}] ${subj.title} — ${result[subj.id].lectures ? result[subj.id].lectures.length : 0} lectures`);
    await new Promise(r => setTimeout(r, 300)); // be polite, don't hammer the server
  }

  const finalJson = JSON.stringify(result);
  console.log('DONE. Total size:', finalJson.length, 'characters');

  try {
    copy(finalJson); // Chrome DevTools console helper — copies to clipboard
    console.log('%cCopied to clipboard! Paste it wherever you need to send it.', 'color: green; font-weight: bold;');
  } catch(e) {
    console.log('Could not auto-copy. Printing below instead — copy manually:');
    console.log(finalJson);
  }
})();
