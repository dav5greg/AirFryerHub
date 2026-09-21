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

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET() {
  if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_REPOSITORY) {
    return json({
      error: "SERVER_NOT_CONFIGURED",
      message: "The recipe API is not configured."
    }, 503);
  }

  try {
    const result = await getGitHubFile();
    return json({
      recipes: result.recipes,
      version: result.sha
    });
  } catch (error) {
    return json({
      error: "SERVER_ERROR",
      message: error instanceof Error ? error.message : "Unknown error"
    }, 500);
  }
}

export async function PUT(request) {
  if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_REPOSITORY) {
    return json({
      error: "SERVER_NOT_CONFIGURED",
      message: "The recipe API is not configured."
    }, 503);
  }

  try {
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

    const current = await getGitHubFile();
    if (current.sha !== expectedSha) {
      return json({
        error: "VERSION_CONFLICT",
        message: "The recipe database changed on another device. Reload before saving.",
        recipes: current.recipes,
        version: current.sha
      }, 409);
    }

    const result = await putGitHubFile(recipes, expectedSha);
    if (result.conflict) {
      const latest = await getGitHubFile();
      return json({
        error: "VERSION_CONFLICT",
        message: "The recipe database changed on another device. Reload before saving.",
        recipes: latest.recipes,
        version: latest.sha
      }, 409);
    }

    const latest = await getGitHubFile();
    return json({
      recipes: latest.recipes,
      version: latest.sha
    });
  } catch (error) {
    return json({
      error: "SERVER_ERROR",
      message: error instanceof Error ? error.message : "Unknown error"
    }, 500);
  }
}
