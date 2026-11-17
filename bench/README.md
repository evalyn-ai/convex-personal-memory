# Memory benchmark

29 synthetic analytics-assistant chats (`cases.ts`; every company, person and metric is fictional). Each case lists the user's messages and, in plain words, what the final memory list must `keep` and must `avoid`: scoped preferences, changes of mind, one-off requests, metrics, colleagues' opinions and pasted rules that must not be learned.

`run.ts` sends each message through the real component (enqueue, claim, one update-model call with this package's prompt and schema, ingest), then a judge model grades the final list against every statement.

```sh
OPENAI_API_KEY=... bun bench/run.ts --model gpt-5-mini [--judge gpt-5] [--cases id,id]
```

Set `OPENAI_BASE_URL` for any OpenAI-compatible endpoint. It makes live model calls, so it is not part of `bun test`.
