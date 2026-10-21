import { BlobNotFoundError, BlobPreconditionFailedError, get, head, put } from "@vercel/blob";
import { readFile } from "node:fs/promises";
import path from "node:path";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, X-Expected-SHA",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS"
};

const BLOB_STORE_ID = "store_mf4bvG7gskaNUTXi";
const BLOB_PATH = "airfryer/recipes.json";

async function readInitialRecipes() {
  const filePath = path.join(process.cwd(), "data", "recipes.json");
  const content = await readFile(filePath, "utf8");
  const recipes = JSON.parse(content);

  if (!validateRecipes(recipes)) {
    throw new Error("data/recipes.json does not match the expected recipe schema");
  }

  return recipes;
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

async function readBlobRecipes() {
  const result = await get(BLOB_PATH, {
    access: "private",
    storeId: BLOB_STORE_ID,
    useCache: false
  });

  const content = await new Response(result.stream).text();
  const recipes = JSON.parse(content);

  if (!validateRecipes(recipes)) {
    throw new Error("The stored recipe database does not match the expected schema");
  }

  return recipes;
}

async function getCurrent() {
  try {
    const metadata = await head(BLOB_PATH, {
      access: "private",
      storeId: BLOB_STORE_ID
    });

    const recipes = await readBlobRecipes();
    return { recipes, version: metadata.etag };
  } catch (error) {
    if (!(error instanceof BlobNotFoundError)) throw error;

    const recipes = await readInitialRecipes();
    await put(BLOB_PATH, JSON.stringify(recipes, null, 2) + "\n", {
      access: "private",
      storeId: BLOB_STORE_ID,
      allowOverwrite: false,
      contentType: "application/json"
    });

    const metadata = await head(BLOB_PATH, {
      access: "private",
      storeId: BLOB_STORE_ID
    });

    return { recipes, version: metadata.etag };
  }
}

async function saveRecipes(recipes, expectedVersion) {
  if (!validateRecipes(recipes)) {
    return { error: "INVALID_RECIPES", status: 400 };
  }

  const current = await getCurrent();
  if (current.version !== expectedVersion) {
    return {
      error: "VERSION_CONFLICT",
      status: 409,
      recipes: current.recipes,
      version: current.version
    };
  }

  try {
    await put(BLOB_PATH, JSON.stringify(recipes, null, 2) + "\n", {
      access: "private",
      storeId: BLOB_STORE_ID,
      allowOverwrite: true,
      ifMatch: expectedVersion,
      contentType: "application/json"
    });
  } catch (error) {
    if (error instanceof BlobPreconditionFailedError) {
      const latest = await getCurrent();
      return {
        error: "VERSION_CONFLICT",
        status: 409,
        recipes: latest.recipes,
        version: latest.version
      };
    }
    throw error;
  }

  return await getCurrent();
}

export default async function handler(request, response) {
  Object.entries(CORS_HEADERS).forEach(([key, value]) => response.setHeader(key, value));

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  try {
    if (request.method === "GET") {
      const current = await getCurrent();
      response.status(200).json({
        recipes: current.recipes,
        version: current.version
      });
      return;
    }

    if (request.method !== "PUT") {
      response.status(405).json({ error: "METHOD_NOT_ALLOWED" });
      return;
    }

    const expectedVersion = request.headers["x-expected-sha"];
    if (!expectedVersion || typeof expectedVersion !== "string") {
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

    const result = await saveRecipes(recipes, expectedVersion);
    if (result.error) {
      response.status(result.status).json({
        error: result.error,
        ...(result.error === "VERSION_CONFLICT"
          ? {
              message: "The recipe database changed on another device. Reload before saving.",
              recipes: result.recipes,
              version: result.version
            }
          : {
              message: "The recipe database does not match the expected schema."
            })
      });
      return;
    }

    response.status(200).json({
      recipes: result.recipes,
      version: result.version
    });
  } catch (error) {
    response.status(500).json({
      error: "SERVER_ERROR",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
}
