export type FileWithPath = File & { webkitRelativePath?: string };

export function getFilePath(file: File): string {
  return (file as FileWithPath).webkitRelativePath || file.name;
}
