import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { defineConfig, type Plugin } from "vite";

const templatesDir = path.resolve("public/templates");

/** Display-sized .webp of a poster; the PNG itself stays full size for export. */
const toPreview = (png: string) => sharp(png).resize({ width: 2048, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();

// Posters are committed as PNG only. The page shows /templates/<event>/<name>.webp: in dev this
// converts the matching PNG on first request (cached until restart), and the build writes the files.
function posterPreviews(): Plugin {
  const cache = new Map<string, Promise<Buffer>>();
  return {
    name: "poster-previews",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const match = req.url?.match(/^\/templates\/((?:[\w-]+\/)*[\w-]+)\.webp$/);
        const png = match ? path.join(templatesDir, `${match[1]}.png`) : "";
        if (!png || !existsSync(png)) return next();
        let preview = cache.get(png);
        if (!preview) cache.set(png, (preview = toPreview(png)));
        preview.then((webp) => {
          res.setHeader("Content-Type", "image/webp");
          res.end(webp);
        }, next);
      });
    },
    async generateBundle() {
      const pngs = (await readdir(templatesDir, { recursive: true })).filter((file) => file.endsWith(".png"));
      await Promise.all(pngs.map(async (file) => this.emitFile({
        type: "asset",
        fileName: `templates/${file.replaceAll("\\", "/").replace(/\.png$/, ".webp")}`,
        source: await toPreview(path.join(templatesDir, file)),
      })));
    },
  };
}

export default defineConfig({
  // Relative URLs so the build works from any path, e.g. GitHub Pages at /<repo>/.
  base: "./",
  plugins: [posterPreviews()],
  server: { host: "127.0.0.1" },
});
