import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import * as prismic from "@prismicio/client";
import type { AllDocumentTypes } from "../../prismicio-types";

export const REPO_ROOT = path.resolve(__dirname, "../..");
export const CACHE_DIR = path.join(REPO_ROOT, ".cache");
export const COVERS_CACHE_DIR = path.join(CACHE_DIR, "covers");
export const LOOKUP_CACHE_PATH = path.join(CACHE_DIR, "lookup-cache.json");
export const STATE_CACHE_PATH = path.join(CACHE_DIR, "prismic-state.json");

export const DEFAULT_CSV_PATH =
  "/cursor/stores/bc-39ec21dc-0b3e-411f-90a4-8d27c33ec0a5/internal/storygraph-export.csv";

export const USER_AGENT =
  "site-ezekiel-ravidat/1.0 (https://github.com/artem-ine/site-ezekiel-ravidat)";

let envLoaded = false;

export function loadEnv(): void {
  if (envLoaded) return;
  envLoaded = true;
  const envLocal = path.join(REPO_ROOT, ".env.local");
  const envDefault = path.join(REPO_ROOT, ".env");
  if (fs.existsSync(envLocal)) dotenv.config({ path: envLocal });
  if (fs.existsSync(envDefault)) dotenv.config({ path: envDefault });
}

export function getRepositoryName(): string {
  loadEnv();
  const cfgPath = path.join(REPO_ROOT, "prismic.config.json");
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8")) as {
    repositoryName: string;
  };
  return process.env.NEXT_PUBLIC_PRISMIC_ENVIRONMENT || cfg.repositoryName;
}

export function getWriteClient(): prismic.WriteClient<AllDocumentTypes> {
  loadEnv();
  const writeToken = process.env.PRISMIC_WRITE_TOKEN;
  if (!writeToken) {
    throw new Error(
      [
        "Missing PRISMIC_WRITE_TOKEN in environment or .env.local.",
        "Create one with: npx prismic@latest token create --write",
      ].join("\n"),
    );
  }
  return prismic.createWriteClient<AllDocumentTypes>(getRepositoryName(), {
    writeToken,
    accessToken: process.env.PRISMIC_ACCESS_TOKEN,
  });
}

export function getReadClient(): prismic.Client<AllDocumentTypes> {
  loadEnv();
  return prismic.createClient<AllDocumentTypes>(getRepositoryName(), {
    accessToken: process.env.PRISMIC_ACCESS_TOKEN,
  });
}
