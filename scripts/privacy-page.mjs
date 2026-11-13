// Regenerates site/privacy.html from PRIVACY.md. Usage: node scripts/privacy-page.mjs
// Handles the Markdown PRIVACY.md uses: headings, paragraphs, lists, tables, bold, italics, code, and links.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const page = `${root}site/privacy.html`;
const marker = "<!-- Generated from PRIVACY.md; edit that file and regenerate. -->";

function escape(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inline(text) {
  return escape(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^\w])_([^_]+)_(?=[^\w]|$)/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/(^|[\s(])(https:\/\/[^\s<)]+[^\s<).,])/g, '$1<a href="$2">$2</a>');
}

function convert(markdown) {
  const blocks = markdown.trim().split(/\n{2,}/);
  return blocks.map((block) => {
    const lines = block.split("\n");
    const heading = /^(#{1,3}) (.*)$/.exec(block);
    if (heading) return `<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`;
    if (lines.every((line) => line.startsWith("- "))) {
      return `<ul>${lines.map((line) => `<li>${inline(line.slice(2))}</li>`).join("")}</ul>`;
    }
    if (lines.every((line) => line.startsWith("|"))) {
      const cells = (line) => line.slice(1, -1).split("|").map((cell) => cell.trim());
      const [head, , ...rows] = lines;
      return `<table><thead><tr>${cells(head).map((cell) => `<th>${inline(cell)}</th>`).join("")}</tr></thead>` +
        `<tbody>${rows.map((row) => `<tr>${cells(row).map((cell) => `<td>${inline(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    }
    return `<p>${inline(lines.join(" "))}</p>`;
  }).join("\n");
}

const html = await readFile(page, "utf8");
const start = html.indexOf(marker) + marker.length;
const end = html.indexOf("    </div>\n  </main>");
if (start < marker.length || end < 0) throw new Error("site/privacy.html is missing its generated section markers.");
const body = convert(await readFile(`${root}PRIVACY.md`, "utf8"));
await writeFile(page, `${html.slice(0, start)}\n      ${body}\n${html.slice(end)}`);
console.log("Updated site/privacy.html");
