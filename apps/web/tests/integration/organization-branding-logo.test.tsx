import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
import { JSDOM } from "jsdom";
import { OrganizationBrandingLogo } from "../../features/organization-branding/components/organization-branding-logo";

void test("a failed organization logo falls back accessibly and a changed logo URL is retried", async (context) => {
  const dom = new JSDOM("<!doctype html><html><body><main id='root'></main></body></html>", {
    url: "https://app.example.test/workspace/organization-branding"
  });
  for (const [name, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    IS_REACT_ACT_ENVIRONMENT: true
  })) {
    Object.defineProperty(globalThis, name, { configurable: true, value });
  }
  const { createRoot } = await import("react-dom/client");
  const container = dom.window.document.getElementById("root");
  assert.ok(container);
  const root = createRoot(container);
  context.after(async () => {
    await act(async () => root.unmount());
    dom.window.close();
  });

  const props = {
    accentColor: "#334155",
    initials: "NW",
    organizationName: "Northwind",
    size: "large" as const
  };
  await act(async () => {
    root.render(<OrganizationBrandingLogo {...props} logoUrl="https://assets.example.test/broken.svg" />);
  });
  const brokenImage = container.querySelector("img");
  assert.ok(brokenImage);
  assert.equal(brokenImage.getAttribute("alt"), "Northwind");

  await act(async () => {
    brokenImage.dispatchEvent(new dom.window.Event("error"));
  });
  const fallback = container.querySelector("[role='img']");
  assert.ok(fallback);
  assert.equal(fallback.getAttribute("aria-label"), "Northwind");
  assert.equal(fallback.textContent, "NW");

  await act(async () => {
    root.render(<OrganizationBrandingLogo {...props} logoUrl="https://assets.example.test/replacement.svg" />);
  });
  const replacementImage = container.querySelector("img");
  assert.ok(replacementImage, "a new organization's logo URL should be tried after the prior logo failed");
  assert.equal(replacementImage.getAttribute("src"), "https://assets.example.test/replacement.svg");

  await act(async () => {
    replacementImage.dispatchEvent(new dom.window.Event("error"));
  });
  assert.equal(container.querySelector("img"), null);
  assert.equal(container.querySelector("[role='img']")?.textContent, "NW");
});