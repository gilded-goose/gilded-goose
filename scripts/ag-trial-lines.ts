// AG's trial banner, line by line. A build with no key prints exactly these on Studio, and a build with a key prints none. The gate that
// walks Studio with no key allows these and nothing else, so a new red line of any other kind still fails it.
const LINES = [
  /^\*{100,}$/,
  /^\*+ AG Studio Pro with AI License \*+$/,
  /^\*+ License Key Not Found \*+$/,
  /^\* All AG Studio Pro with AI features are unlocked for trial\. +\*$/,
  /^\* If you want to hide the watermark please email info@ag-grid\.com for a trial license key\. +\*$/,
];
export const isAgTrialLine = (text: string): boolean => LINES.some((l) => l.test(text));
