# Review correction verification, 2026-10-07

Production inspection of school `cms5tnzlr0001jt04qh0lluva` returned exactly one relevant record: `review_real_003`.

- authorName: Google ユーザー（必由館高校・高3）
- comment and aiReplyDraft already exactly match the third-year text supplied in the request.
- originalText is null; the existing API correctly returns comment as both originalText and comment.
- source is GOOGLE and status is REPLIED.
- createdAt remains 2026-10-02T05:27:01.345Z. It was not replaced with the inspection date.
- replyText, the separate stored posted-reply record, still mentions 高校2年生. This was NOT changed to avoid representing an unverified external reply edit as completed.

No fallbackReviews definition exists in the current application. The dashboard API reexports the authenticated database-backed reviews route. No data update, reset, schema change or synthetic review was needed.

Added an API regression test for the actual nullable originalText shape, exact corrected author/comment/draft, retained timestamps/status and unchanged posted-reply history. This verifies the user-provided text, not an independent live comparison with Google Maps. No Google reply was published by this task.
