export function triggerFileDownload(url: string, filename?: string): void {
  const link = document.createElement("a");
  link.href = url;
  if (filename) {
    link.download = filename;
  }
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}
