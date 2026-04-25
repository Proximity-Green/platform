# Intersting ideas around saving

_Saved 2026-04-23T15:53:35.347Z — 6 messages._

---

## You

lets see if this note saves

## Claude

It looks like this message came through as a plain note rather than a question about the platform! 😄

It seems like you might have been testing a **notes/comment feature** somewhere in the UI — but that message landed here in the chat instead.

Is there something I can help you with on the **Proximity Green** platform? For example:

- 📊 **Data lookups** — counts, records, summaries
- 🔍 **Finding a specific person, org, invoice, etc.**
- 🛠️ **Understanding the domain model or schema**
- 🔗 **Links to specific pages in the admin dashboard**

Just let me know!

## You

i want to know if save chats has been implemented and i can check if it works

## Claude

Based on the schema, **save chats has not been implemented** yet. There are no `chat`, `conversation`, or `chat_history` tables in the database.

What does exist is:
- **`notes`** — a general notes table (which might be what you were testing earlier?)
- **`message_templates`** — for templated messages
- **`subscription_line_rate_history`** — unrelated billing history

So your earlier message "let's see if this note saves" didn't persist anywhere on the backend from this chat interface — there's no persistence layer for it yet.

If saving chat history is a feature you'd like to implement, it would need a new table (e.g. `chat_sessions` + `chat_messages`) and wiring in the SvelteKit frontend. Want me to sketch out what that schema might look like?

## You

we asked for this to be saved into docs

## Claude

There's **no `docs` table** in the database at all — so it looks like the save-chats-to-docs feature **hasn't been implemented yet** on the backend side.

You mentioned it was requested — it's possible it was scoped/designed but not yet built. To get it working you'd need:

1. A **`docs` table** (or similar) in the database
2. **API endpoint** to persist chat messages into it
3. **Frontend wiring** in the SvelteKit UI to trigger the save

You can check the [Docs](http://localhost:5173/docs) page in the admin to see if there's any UI for it already, even if the backend isn't there yet. Would you like help speccing out what the schema or implementation should look like?
