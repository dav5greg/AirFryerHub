const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, X-Expected-SHA",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Content-Type": "application/json; charset=utf-8"
};

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, ...extra }
  });
}

function githubHeaders(env) {
  return {
    "Accept": "application/vnd.github+json",
    "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "AirFryerHub-API-Worker"
  };
}

function githubFileUrl(env) {
  const repo = env.GITHUB_REPOSITORY;
  const path = env.GITHUB_FILE_PATH || "data/recipes.json";
  return `https://api.github.com/repos/${repo}/contents/${path}`;
}

async function getGitHubFile(env) {
  const response = await fetch(githubFileUrl(env), {
    headers: githubHeaders(env)
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub GET failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  const decoded = atob(data.content.replace(/\\n/g, ""));
  const recipes = JSON.parse(decoded);

  if (!Array.isArray(recipes)) {
    throw new Error("data/recipes.json must contain a JSON array");
  }

  return { recipes, sha: data.sha };
}

function validateRecipes(recipes) {
  if (!Array.isArray(recipes)) return false;

  return recipes.every(recipe =>
    recipe &&
    typeof recipe.id === "string" &&
    typeof recipe.name === "string" &&
    typeof recipe.category === "string" &&
    ["snack", "carne", "pesce", "dolci", "altro"].includes(recipe.category) &&
    Number.isFinite(Number(recipe.temp)) &&
    Number.isFinite(Number(recipe.time)) &&
    typeof recipe.shake === "boolean"
  );
}

async function putGitHubFile(env, recipes, expectedSha) {
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(recipes, null, 2) + "\n")));

  const response = await fetch(githubFileUrl(env), {
    method: "PUT",
    headers: {
      ...githubHeaders(env),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: "Update recipe database",
      content,
      sha: expectedSha,
      branch: env.GITHUB_BRANCH || "main"
    })
  });

  if (response.status === 409) {
    return { conflict: true };
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub PUT failed (${response.status}): ${body}`);
  }

  return { conflict: false };
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    try {
      if (request.method === "GET") {
        const result = await getGitHubFile(env);
        return json({
          recipes: result.recipes,
          version: result.sha
        });
      }

      if (request.method === "PUT") {
        // IMPORTANT: this endpoint must not be exposed publicly without
        // an authorization mechanism. The browser must never contain
        // GITHUB_TOKEN or another shared write secret.
        return json({
          error: "WRITE_AUTH_REQUIRED",
          message: "Recipe writes are disabled until a secure user authorization mechanism is configured."
        }, 501);
      }

      return json({ error: "METHOD_NOT_ALLOWED" }, 405);
    } catch (error) {
      return json({
        error: "SERVER_ERROR",
        message: error instanceof Error ? error.message : "Unknown error"
      }, 500);
    }
  }
};
