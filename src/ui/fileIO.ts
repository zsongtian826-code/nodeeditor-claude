/** ブラウザでファイルとして保存させる */
export function downloadText(fileName: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export async function readFileText(file: File): Promise<string> {
  if (file.size > MAX_IMPORT_BYTES) throw new Error('ファイルが大きすぎます（5MBまで）');
  return await file.text();
}
