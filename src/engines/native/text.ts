/**
 * The Zipformer model writes in capitals ("HELLO THERE"); make it read like a sentence.
 * Finished sentences already come punctuated and cased by the native module: leave those alone.
 */
export function tidyTranscript(text: string): string {
  if (text !== text.toUpperCase()) return text;
  const lower = text.toLowerCase().replace(/\bi\b/g, 'I').replace(/\bi'(m|ll|ve|d)\b/g, "I'$1");
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
