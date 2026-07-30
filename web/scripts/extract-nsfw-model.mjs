import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const modelPath = resolve(__dirname, '../node_modules/nsfwjs/dist/models/mobilenet_v2');
const outputDir = resolve(__dirname, '../public/models/nsfw');

const model = require(resolve(modelPath, 'model.min.js'));
const shardBase64 = require(resolve(modelPath, 'group1-shard1of1.min.js'));

const modelJson = {
  modelTopology: model.modelTopology,
  weightsManifest: model.weightsManifest,
  format: model.format,
  generatedBy: model.generatedBy,
  convertedBy: model.convertedBy,
  trainingConfig: model.trainingConfig,
  userDefinedMetadata: model.userDefinedMetadata,
};

if (!existsSync(outputDir)) {
  mkdirSync(outputDir, { recursive: true });
}

writeFileSync(resolve(outputDir, 'model.json'), JSON.stringify(modelJson));

const shardName = model.weightsManifest[0].paths[0];
const binary = Buffer.from(shardBase64, 'base64');
writeFileSync(resolve(outputDir, shardName), binary);

console.log(`Extracted NSFW model to ${outputDir}`);
console.log(`  model.json (${(JSON.stringify(modelJson).length / 1024).toFixed(1)} KB)`);
console.log(`  ${shardName} (${(binary.length / 1024).toFixed(1)} KB)`);
