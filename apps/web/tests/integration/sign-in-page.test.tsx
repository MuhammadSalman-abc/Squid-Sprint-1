import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import SignInPage from "../../app/(public)/sign-in/page";

void test("sign-in page renders both OAuth choices, accessible email form, and a safe error state", async () => {
  const token = "a".repeat(40);
  const markup = renderToStaticMarkup(await SignInPage({
    searchParams: Promise.resolve({ error: "invalid-sign-in", returnTo: `/workspace/invitations/accept?token=${token}` })
  }));

  assert.match(markup, /href="\/identity\/sign-in\/google"/);
  assert.match(markup, /href="\/identity\/sign-in\/microsoft"/);
  assert.match(markup, /Sign-in could not be verified/);
  assert.match(markup, /role="alert"/);
  assert.match(markup, /aria-label="Email address"|id="email"/);
  assert.match(markup, /autoComplete="email"|autocomplete="email"/);
  assert.match(markup, /name="returnTo"/);
  assert.match(markup, /Your work, in its right place\./);
});
