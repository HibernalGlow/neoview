self.addEventListener('message', async (e) => {
  const { id, action } = e.data || {};
  try {
    if (action === 'blobToDataUrl') {
      const blob = e.data.blob;
      // read as base64 data URL
      const arrayBuffer = await blob.arrayBuffer();
      // convert to base64
      let binary = '';
      const bytes = new Uint8Array(arrayBuffer);
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, Array.prototype.slice.call(bytes, i, i + chunkSize));
      }
      const b64 = btoa(binary);
      // attempt to get type
      const type = blob.type || 'image/webp';
      const dataUrl = `data:${type};base64,${b64}`;
      self.postMessage({ id, success: true, data: dataUrl });
    } else if (action === 'blobToArrayBuffer') {
      const blob = e.data.blob;
  const ab = await blob.arrayBuffer();
  // Transfer the ArrayBuffer (works in worker contexts)
  (self as any).postMessage({ id, success: true, data: ab }, [ab]);
    } else {
      self.postMessage({ id, success: false, error: 'unknown action' });
    }
  } catch (err) {
    self.postMessage({ id, success: false, error: err?.toString ? err.toString() : String(err) });
  }
});
