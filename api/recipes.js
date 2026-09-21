const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, X-Expected-SHA",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

function githubHeaders() {
  return {
    "Accept": "application/vnd.github+json",
    "Authorization": `Bearer ${process.env.GITHUB_TOKEN}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "AirFryerHub-Vercel-API"
  };
}

function githubFileUrl() {
  const repo = process.env.GITHUB_REPOSITORY;
  const path = process.env.GITHUB_FILE_PATH || "data/recipes.json";
  return `https://api.github.com/repos/${repo}/contents/${path}`;
}

async function getGitHubFile() {
  const response = await fetch(githubFileUrl(), {
    headers: githubHeaders(),
    cache: "no-store"
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub GET failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  const recipes = JSON.parse(Buffer.from(data.content.replace(/\\n/g, ""), "base64").toString("utf8"));

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

async function putGitHubFile(recipes, expectedSha) {
  const content = Buffer.from(JSON.stringify(recipes, null, 2) + "\n", "utf8").toString("base64");

  const response = await fetch(githubFileUrl(), {
    method: "PUT",
    headers: {
      ...githubHeaders(),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: "Update recipe database",
      content,
      sha: expectedSha,
      branch: process.env.GITHUB_BRANCH || "main"
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

export default async function handler(request, response) {
  Object.entries(CORS_HEADERS).forEach(([key, value]) => response.setHeader(key, value));

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_REPOSITORY) {
    response.status(503).json({
      error: "SERVER_NOT_CONFIGURED",
      message: "The recipe API is not configured."
    });
    return;
  }

  try {
    if (request.method === "GET") {
      const result = await getGitHubFile();
      response.status(200).json({
        recipes: result.recipes,
        version: result.sha
      });
      return;
    }

    if (request.method !== "PUT") {
      response.status(405).json({ error: "METHOD_NOT_ALLOWED" });
      return;
    }

    const expectedSha = request.headers["x-expected-sha"];
    if (!expectedSha || typeof expectedSha !== "string") {
      response.status(400).json({
        error: "EXPECTED_SHA_REQUIRED",
        message: "The client must send the version it last read."
      });
      return;
    }

    const bodyText = typeof request.body === "string"
      ? request.body
      : JSON.stringify(request.body ?? "");

    if (bodyText.length > 200000) {
      response.status(413).json({
        error: "PAYLOAD_TOO_LARGE",
        message: "The recipe database payload is too large."
      });
      return;
    }

    let recipes;
    try {
      recipes = JSON.parse(bodyText);
    } catch {
      response.status(400).json({
        error: "INVALID_JSON",
        message: "The request body must contain valid JSON."
      });
      return;
    }

    if (!validateRecipes(recipes)) {
      response.status(400).json({
        error: "INVALID_RECIPES",
        message: "The recipe database does not match the expected schema."
      });
      return;
    }

    const current = await getGitHubFile();
    if (current.sha !== expectedSha) {
      response.status(409).json({
        error: "VERSION_CONFLICT",
        message: "The recipe database changed on another device. Reload before saving.",
        recipes: current.recipes,
        version: current.sha
      });
      return;
    }

    const result = await putGitHubFile(recipes, expectedSha);
    if (result.conflict) {
      const latest = await getGitHubFile();
      response.status(409).json({
        error: "VERSION_CONFLICT",
        message: "The recipe database changed on another device. Reload before saving.",
        recipes: latest.recipes,
        version: latest.sha
      });
      return;
    }

    const latest = await getGitHubFile();
    response.status(200).json({
      recipes: latest.recipes,
      version: latest.sha
    });
  } catch (error) {
    response.status(500).json({
      error: "SERVER_ERROR",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
}
