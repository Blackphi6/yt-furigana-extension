import {
  parseLlmSegments,
  segmentsToHtml,
  validateSegments
} from "../src/segment-html.js";

const json = `{"segments":[{"t":"一","r":"ひと"},{"t":"組","r":"くみ"},{"t":"目"}]}`;
const segments = parseLlmSegments(json);

if (!validateSegments("一組目", segments)) {
  throw new Error("validation failed for 一組目");
}

const html = segmentsToHtml(segments);
const expected = "<ruby>一<rt>ひと</rt></ruby><ruby>組<rt>くみ</rt></ruby>目";
if (html !== expected) {
  throw new Error(`expected ${expected}, got ${html}`);
}

const fenced = "```json\n" + json + "\n```";
const parsedFence = parseLlmSegments(fenced);
if (!validateSegments("一組目", parsedFence)) {
  throw new Error("fenced JSON parse failed");
}

const variantJson = `{"segments":[{"t":"何と、"},{"t":"一","r":"ひと"},{"t":"組","r":"くみ"},{"t":"目"}]}`;
const variantSegments = parseLlmSegments(variantJson);
if (validateSegments("なんと、一組目", variantSegments)) {
  throw new Error("changed surface text should be rejected");
}

console.log("Segment HTML tests passed.");
