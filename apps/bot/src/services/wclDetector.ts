export function extractWarcraftLogsUrls(content: string): string[] {
  const wclUrlRegex =
    /https?:\/\/(?:vanilla|classic)\.warcraftlogs\.com\/reports\/([a-zA-Z0-9]{16})/g;

  const urls: string[] = [];
  let match;

  while ((match = wclUrlRegex.exec(content)) !== null) {
    const reportId = match[1];
    urls.push(`https://vanilla.warcraftlogs.com/reports/${reportId}`);
  }

  return urls;
}

export function extractReportId(wclUrl: string): string | null {
  const match = wclUrl.match(/\/reports\/([a-zA-Z0-9]{16})/);
  return match ? match[1] : null;
}
