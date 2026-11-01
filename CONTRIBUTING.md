# 🤝 Contributing to Dark Zone MD

Thanks for wanting to help! Every bug report, idea and fix is welcome.

## Ways to help
- 🐛 **Report a bug** using the [bug report form](../../issues/new/choose)
- 💡 **Suggest a feature** using the feature request form
- 🛠️ **Send a fix or a new command** with a pull request

## Quick start for code changes
1. Click **Fork** on GitHub, then clone your fork.
2. Install: `pnpm install`
3. Create a branch: `git checkout -b my-change`
4. Make your change. Keep it small and focused.
5. Check types: `pnpm run typecheck`
6. Commit with a clear message, for example `Add .hello command`.
7. Push your branch and open a **pull request**.

## Adding a command
Commands live in `artifacts/api-server/src/lib/commands/handlers/`.

```ts
{
  name: "hello",
  aliases: ["hi"],
  category: "OTHER",
  desc: "Say hello",
  handler: async (ctx) => {
    await ctx.reply(`Hello from *${ctx.config.botName}*! 👋`);
  },
},
```

Then add `"hello"` to the right category in `menu-data.ts` so it shows in the menu.

## Rules
- ❌ **Never commit secrets.** No `.env`, tokens, API keys or WhatsApp session files.
- Keep command names short and lowercase.
- Write a short `desc` for every command.
- Be kind. See the [Code of Conduct](CODE_OF_CONDUCT.md).
