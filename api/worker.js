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

    if (!env.GITHUB_TOKEN || !env.GITHUB_REPOSITORY) {
      return json({
        error: "SERVER_NOT_CONFIGURED",
        message: "The recipe API is not configured."
      }, 503);
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
        const expectedSha = request.headers.get("X-Expected-SHA");
        if (!expectedSha) {
          return json({
            error: "EXPECTED_SHA_REQUIRED",
            message: "The client must send the version it last read."
          }, 400);
        }

        const bodyText = await request.text();
        if (bodyText.length > 200000) {
          return json({
            error: "PAYLOAD_TOO_LARGE",
            message: "The recipe database payload is too large."
          }, 413);
        }

        let recipes;
        try {
          recipes = JSON.parse(bodyText);
        } catch {
          return json({
            error: "INVALID_JSON",
            message: "The request body must contain valid JSON."
          }, 400);
        }

        if (!validateRecipes(recipes)) {
          return json({
            error: "INVALID_RECIPES",
            message: "The recipe database does not match the expected schema."
          }, 400);
        }

        const current = await getGitHubFile(env);
        if (current.sha !== expectedSha) {
          return json({
            error: "VERSION_CONFLICT",
            message: "The recipe database changed on another device. Reload before saving.",
            recipes: current.recipes,
            version: current.sha
          }, 409);
        }

        const result = await putGitHubFile(env, recipes, expectedSha);
        if (result.conflict) {
          const latest = await getGitHubFile(env);
          return json({
            error: "VERSION_CONFLICT",
            message: "The recipe database changed on another device. Reload before saving.",
            recipes: latest.recipes,
            version: latest.sha
          }, 409);
        }

        const latest = await getGitHubFile(env);
        return json({
          recipes: latest.recipes,
          version: latest.sha
        }, 200);
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
