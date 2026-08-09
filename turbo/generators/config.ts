import type { PlopTypes } from "@turbo/gen";

export default function generator(plop: PlopTypes.NodePlopAPI): void {
  plop.setGenerator("monitor", {
    description: "Add a new monitor to the seed script",
    prompts: [
      {
        type: "input",
        name: "slug",
        message: "slug (lowercase, dashes only):",
        validate: (v: string) => /^[a-z0-9-]+$/.test(v) || "lowercase + dashes only",
      },
      { type: "input", name: "name", message: "display name:" },
      { type: "input", name: "url", message: "URL to probe:" },
      {
        type: "input",
        name: "intervalSeconds",
        message: "interval seconds (>= 30):",
        default: "60",
      },
    ],
    actions: [
      {
        type: "append",
        path: "packages/db/src/seed.ts",
        pattern: /\/\/ <openmonitor-monitors>/,
        template: `// Added by generator
    {
      slug: "{{slug}}",
      name: "{{name}}",
      url: "{{url}}",
      method: "GET",
      expectedStatus: 200,
      intervalSeconds: {{intervalSeconds}},
    },`,
      },
    ],
  });

  plop.setGenerator("package", {
    description: "Scaffold a new package under packages/",
    prompts: [
      {
        type: "input",
        name: "name",
        message: "package name (without @openmonitor/ prefix):",
      },
    ],
    actions: [
      {
        type: "add",
        path: "packages/{{name}}/package.json",
        templateFile: "templates/package/package.json.hbs",
      },
      {
        type: "add",
        path: "packages/{{name}}/tsconfig.json",
        templateFile: "templates/package/tsconfig.json.hbs",
      },
      {
        type: "add",
        path: "packages/{{name}}/src/index.ts",
        templateFile: "templates/package/index.ts.hbs",
      },
      {
        type: "add",
        path: "packages/{{name}}/CLAUDE.md",
        templateFile: "templates/package/CLAUDE.md.hbs",
      },
    ],
  });

  plop.setGenerator("hono-app", {
    description: "Scaffold a new Hono app under apps/",
    prompts: [
      {
        type: "input",
        name: "name",
        message: "app name (without @openmonitor/ prefix):",
      },
      { type: "input", name: "port", message: "port:", default: "3003" },
    ],
    actions: [
      {
        type: "add",
        path: "apps/{{name}}/package.json",
        templateFile: "templates/hono-app/package.json.hbs",
      },
      {
        type: "add",
        path: "apps/{{name}}/tsconfig.json",
        templateFile: "templates/hono-app/tsconfig.json.hbs",
      },
      {
        type: "add",
        path: "apps/{{name}}/src/index.ts",
        templateFile: "templates/hono-app/index.ts.hbs",
      },
      {
        type: "add",
        path: "apps/{{name}}/CLAUDE.md",
        templateFile: "templates/hono-app/CLAUDE.md.hbs",
      },
    ],
  });
}
