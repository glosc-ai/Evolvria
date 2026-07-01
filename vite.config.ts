import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";

export default defineConfig({
  plugins: [publicSkillsManifestPlugin(), vue(), tailwindcss()],
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
  clearScreen: false,
  server: {
    host: "127.0.0.1",
    port: 5174,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
});

interface SkillManifest {
  skills: Array<{
    name: string;
    path: string;
  }>;
}

function publicSkillsManifestPlugin(): Plugin {
  let publicDir = path.resolve(process.cwd(), "public");

  return {
    name: "evolvria-public-skills-manifest",
    configResolved(config) {
      publicDir = config.publicDir ? path.resolve(config.root, config.publicDir) : path.resolve(config.root, "public");
    },
    buildStart() {
      writeSkillsManifest(path.join(publicDir, "skills"));
    },
    configureServer(server) {
      const skillsDir = path.join(publicDir, "skills");
      server.watcher.add(skillsDir);
      server.watcher.on("add", (file) => refreshSkillsManifest(skillsDir, file));
      server.watcher.on("unlink", (file) => refreshSkillsManifest(skillsDir, file));

      server.middlewares.use((req, res, next) => {
        const requestPath = stripBase(req.url ?? "", server.config.base);
        if (requestPath !== "/skills/manifest.json") {
          next();
          return;
        }

        const manifest = buildSkillsManifest(skillsDir);
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(`${JSON.stringify(manifest, null, 2)}\n`);
      });
    },
  };
}

function refreshSkillsManifest(skillsDir: string, file: string): void {
  if (!file.startsWith(skillsDir)) return;
  const basename = path.basename(file);
  if (basename === "SKILL.md" || basename === "skills.md") {
    writeSkillsManifest(skillsDir);
  }
}

function writeSkillsManifest(skillsDir: string): void {
  fs.mkdirSync(skillsDir, { recursive: true });
  const manifestPath = path.join(skillsDir, "manifest.json");
  fs.writeFileSync(manifestPath, `${JSON.stringify(buildSkillsManifest(skillsDir), null, 2)}\n`, "utf8");
}

function buildSkillsManifest(skillsDir: string): SkillManifest {
  if (!fs.existsSync(skillsDir)) return { skills: [] };

  const skills = fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^[a-z0-9][a-z0-9-]*$/.test(entry.name))
    .map((entry) => {
      const skillFile = ["SKILL.md", "skills.md"].find((filename) => fs.existsSync(path.join(skillsDir, entry.name, filename)));
      return skillFile ? { name: entry.name, path: `${entry.name}/${skillFile}` } : null;
    })
    .filter((entry): entry is SkillManifest["skills"][number] => Boolean(entry))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { skills };
}

function stripBase(rawUrl: string, base: string): string {
  const requestPath = rawUrl.split("?")[0] || "/";
  const normalizedBase = base === "/" ? "" : base.replace(/\/$/, "");
  return normalizedBase && requestPath.startsWith(normalizedBase) ? requestPath.slice(normalizedBase.length) || "/" : requestPath;
}
