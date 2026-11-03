/**
 * The web dashboard login uses Clerk. Clerk needs BOTH keys to work. When they
 * are missing (for example a phone running the bot with Telegram only), the
 * login is simply turned off instead of making every web request fail.
 */
export function isClerkConfigured(): boolean {
  return Boolean(process.env.CLERK_PUBLISHABLE_KEY?.trim() && process.env.CLERK_SECRET_KEY?.trim());
}
