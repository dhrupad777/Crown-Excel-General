// Triggers a browser download for an in-memory Blob. Lives in its own module so both the CSV/
// PDF helpers (exportUtils) and the styled Excel writer (excelWriter) can use it without the two
// importing each other in a cycle.
export const downloadBlob = (filename, blob) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
