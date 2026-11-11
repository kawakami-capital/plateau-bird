#!/usr/bin/env node
/**
 * 変換済みのビューアと都市データを、非公開の R2 バケットへ置く準備用の脚本です。
 * 認証情報はファイルに書かず、環境変数だけを使います。
 *
 *   CLOUDFLARE_ACCOUNT_ID=（アカウントID） \
 *   CLOUDFLARE_API_TOKEN=（トークン） \
 *   node scripts/upload-to-r2.mjs --dry-run
 *
 * このリポジトリに同梱した版は、確認表示だけして終了します。
 * 実際のアップロードは、バケット作成と公開方針を決めたあとに実装・実行してください。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const viewer = path.join(root, "viewer");

const hasAccount = Boolean(process.env.CLOUDFLARE_ACCOUNT_ID);
const hasToken = Boolean(process.env.CLOUDFLARE_API_TOKEN);

console.log(JSON.stringify({
  stop: true,
  reason: "この脚本は準備用です。バケット作成と公開の承認後に、別途実行してください。認証情報の有無だけを確認し、送信はしません。",
  viewer_dir: viewer,
  viewer_exists: fs.existsSync(viewer),
  account_id_env_set: hasAccount,
  api_token_env_set: hasToken,
  public_access: false,
}, null, 2));
process.exit(2);
