import assert from "node:assert/strict";
import {
  isAnnotationMarkerInner,
  stripAnnotationMarkers
} from "../src/annotation-markers.js";
import { stripAnnotationMarkers as siteStrip } from "../site/annotation-markers.js";

assert.equal(isAnnotationMarkerInner("⑫"), true);
assert.equal(isAnnotationMarkerInner("14"), true);
assert.equal(isAnnotationMarkerInner("ね"), false);
assert.equal(isAnnotationMarkerInner("きょう"), false);

const sample =
  "その姿は、ただの見物（⑫）人にとっても、間違いなく一枚上手（⑬）の生き様に見えた。彼は一日（⑭）中、一心不乱に手を動かし続けている。";
const cleaned =
  "その姿は、ただの見物人にとっても、間違いなく一枚上手の生き様に見えた。彼は一日中、一心不乱に手を動かし続けている。";

assert.equal(stripAnnotationMarkers(sample), cleaned);
assert.equal(siteStrip(sample), cleaned, "site copy must match src stripper");

// Demo bug: API spans are on cleaned text. Overlay on original → wrong surface.
{
  const short = "見物（⑫）人";
  const stripped = stripAnnotationMarkers(short);
  assert.equal(stripped, "見物人");
  // token 「人」 at [2,3] on cleaned
  assert.equal(stripped.slice(2, 3), "人");
  assert.equal(short.slice(2, 3), "（", "original overlay would pick 注釈 — the demo bug");
}

assert.equal(stripAnnotationMarkers("音（ね）が聞こえる"), "音（ね）が聞こえる");
assert.equal(stripAnnotationMarkers("音(ね)です"), "音(ね)です");
assert.equal(stripAnnotationMarkers("見物(12)人"), "見物人");

console.log("annotation-markers tests passed.");
