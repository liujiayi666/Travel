import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const distDirectory = fileURLToPath(new URL("../dist/", import.meta.url));
const initialJsGzipLimit = 180 * 1024;
const initialCssGzipLimit = 40 * 1024;

const listFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? listFiles(path) : [path];
    }),
  );

  return files.flat();
};

const formatSize = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;

const gzipSize = async (path) =>
  gzipSync(await readFile(path), { level: 9 }).byteLength;

const indexPath = join(distDirectory, "index.html");
const html = await readFile(indexPath, "utf8");
const files = await listFiles(distDirectory);
const relativeFiles = files.map((path) =>
  relative(distDirectory, path).replaceAll("\\", "/"),
);

const initialReferences = [
  ...html.matchAll(
    /(?:src|href)="\/(assets\/[^"]+\.(?:css|js))"/g,
  ),
].map((match) => match[1]);
const initialJs = [
  ...new Set(initialReferences.filter((path) => path.endsWith(".js"))),
];
const initialCss = [
  ...new Set(initialReferences.filter((path) => path.endsWith(".css"))),
];
const allJs = relativeFiles.filter((path) => path.endsWith(".js"));
const allCss = relativeFiles.filter((path) => path.endsWith(".css"));
const dynamicJs = allJs.filter((path) => !initialJs.includes(path));
const errors = [];

if (allJs.length < 3) {
  errors.push("Expected entry and vendor JavaScript chunks were not generated.");
}

if (initialJs.length < 2) {
  errors.push("The HTML does not reference split initial JavaScript chunks.");
}

if (dynamicJs.length < 2) {
  errors.push("Expected lazy route and auth-modal JavaScript chunks.");
}

if (allCss.length < 2) {
  errors.push("CSS was not split into an entry stylesheet and lazy styles.");
}

if (!allJs.some((path) => path.includes("/vendor-react-"))) {
  errors.push("Missing chunk: vendor-react.");
}

if (!allJs.some((path) => path.includes("/vendor-data-"))) {
  errors.push("Missing chunk: vendor-data.");
}

if (!dynamicJs.some((path) => path.includes("/ChatRoute-"))) {
  errors.push("Missing lazy chunk: ChatRoute.");
}

if (!dynamicJs.some((path) => path.includes("/AuthModal-"))) {
  errors.push("Missing lazy chunk: AuthModal.");
}

const misplacedAssets = relativeFiles.filter(
  (path) =>
    path.startsWith("assets/") &&
    !/^assets\/(?:css|fonts|images|js|media)\//.test(path),
);
if (misplacedAssets.length > 0) {
  errors.push(
    `Assets found outside their production directories: ${misplacedAssets.join(", ")}`,
  );
}

const unhashedAssets = relativeFiles.filter(
  (path) =>
    path.startsWith("assets/") &&
    /\.(?:css|js|woff2?)$/.test(path) &&
    !/-[A-Za-z0-9_-]{8,}\.[^.]+$/.test(path),
);
if (unhashedAssets.length > 0) {
  errors.push(
    `Production assets missing content hashes: ${unhashedAssets.join(", ")}`,
  );
}

const initialJsBytes = (
  await Promise.all(
    initialJs.map((path) => gzipSize(join(distDirectory, path))),
  )
).reduce((total, size) => total + size, 0);
const initialCssBytes = (
  await Promise.all(
    initialCss.map((path) => gzipSize(join(distDirectory, path))),
  )
).reduce((total, size) => total + size, 0);

if (initialJsBytes > initialJsGzipLimit) {
  errors.push(
    `Initial JavaScript is ${formatSize(initialJsBytes)} gzip; budget is ${formatSize(initialJsGzipLimit)}.`,
  );
}

if (initialCssBytes > initialCssGzipLimit) {
  errors.push(
    `Initial CSS is ${formatSize(initialCssBytes)} gzip; budget is ${formatSize(initialCssGzipLimit)}.`,
  );
}

console.table(
  dynamicJs.map((path) => ({
    chunk: path.split("/").at(-1),
  })),
);
console.log(
  `Initial JavaScript: ${formatSize(initialJsBytes)} gzip across ${initialJs.length} chunks`,
);
console.log(
  `Initial CSS: ${formatSize(initialCssBytes)} gzip across ${initialCss.length} chunks`,
);

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log("Production bundle budget passed.");
}
