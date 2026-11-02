import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function listFiles(directory, root = directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(path, root));
    else if (entry.isFile()) files.push(relative(root, path).split(sep).join("/"));
  }
  return files.sort();
}

/** Generate an atomic, complete offline shell from this exact production build. */
export async function generatePrecache({ distPath = join(projectRoot, "dist"), templatePath = join(projectRoot, "public", "sw.js") } = {}) {
  const template = await readFile(templatePath, "utf8");
  if (!template.includes('"__HOUSEOS_BUILD_ID__"') || !template.includes('["__HOUSEOS_PRECACHE__"]')) {
    throw new Error("The service-worker template is missing its build markers.");
  }
  const files = (await listFiles(distPath)).filter((file) => file !== "sw.js" && !file.endsWith(".map"));
  if (!files.includes("index.html")) throw new Error("Build HouseOS before generating its offline shell: dist/index.html is missing.");
  const paths = ["./", ...files.map((file) => `./${file.split("/").map(encodeURIComponent).join("/")}`)];
  const hash = createHash("sha256").update(template).update(JSON.stringify(paths));
  for (const file of files) hash.update(file).update("\0").update(await readFile(join(distPath, file))).update("\0");
  const buildId = hash.digest("hex").slice(0, 20);
  const worker = template.replace('"__HOUSEOS_BUILD_ID__"', JSON.stringify(buildId))
    .replace('["__HOUSEOS_PRECACHE__"]', JSON.stringify(paths));
  await writeFile(join(distPath, "sw.js"), worker, "utf8");
  return { buildId, files, paths };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const result = await generatePrecache();
  console.log(`Offline shell ready: ${result.paths.length} resources · build ${result.buildId}`);
}
