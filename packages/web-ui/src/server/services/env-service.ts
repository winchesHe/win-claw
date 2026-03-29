import { readFileSync, writeFileSync, existsSync } from "node:fs";
import type { EnvVar } from "../types.js";
import { UnknownEnvKeyError } from "../errors.js";

const MASKED_VALUE = "••••••••";

export class EnvService {
  private readonly envPath: string;
  private readonly envExamplePath: string;

  constructor(envPath: string, envExamplePath: string) {
    this.envPath = envPath;
    this.envExamplePath = envExamplePath;
  }

  getEnvVars(): EnvVar[] {
    const envKeys = this.parseKeysFromFile(this.envPath);
    const exampleKeys = this.parseKeysFromFile(this.envExamplePath);

    const allKeys = new Set([...envKeys.keys(), ...exampleKeys.keys()]);
    const result: EnvVar[] = [];

    for (const key of allKeys) {
      const isSet = envKeys.has(key);
      const inExample = exampleKeys.has(key);
      const rawValue = envKeys.get(key) ?? "";
      result.push({
        key,
        maskedValue: isSet && rawValue !== "" ? MASKED_VALUE : "",
        isSet,
        inExample,
      });
    }

    return result;
  }

  updateEnvVars(updates: Record<string, string>): void {
    const envKeys = this.parseKeysFromFile(this.envPath);
    const exampleKeys = this.parseKeysFromFile(this.envExamplePath);
    const allowedKeys = new Set([...envKeys.keys(), ...exampleKeys.keys()]);

    const invalidKeys = Object.keys(updates).filter((k) => !allowedKeys.has(k));
    if (invalidKeys.length > 0) {
      throw new UnknownEnvKeyError(invalidKeys);
    }

    const envExists = existsSync(this.envPath);
    const originalLines = envExists ? readFileSync(this.envPath, "utf-8").split("\n") : [];

    const updatedKeys = new Set<string>();
    const newLines: string[] = [];

    for (const line of originalLines) {
      const parsed = this.parseKeyValueLine(line);
      if (parsed && parsed.key in updates) {
        newLines.push(`${parsed.key}=${updates[parsed.key]}`);
        updatedKeys.add(parsed.key);
      } else {
        newLines.push(line);
      }
    }

    // Add keys that exist in .env.example but not in .env
    for (const key of Object.keys(updates)) {
      if (!updatedKeys.has(key)) {
        newLines.push(`${key}=${updates[key]}`);
      }
    }

    writeFileSync(this.envPath, newLines.join("\n"), "utf-8");
  }

  private parseKeysFromFile(filePath: string): Map<string, string> {
    const keys = new Map<string, string>();
    if (!existsSync(filePath)) {
      return keys;
    }
    const content = readFileSync(filePath, "utf-8");
    for (const line of content.split("\n")) {
      const parsed = this.parseKeyValueLine(line);
      if (parsed) {
        keys.set(parsed.key, parsed.value);
      }
    }
    return keys;
  }

  private parseKeyValueLine(line: string): { key: string; value: string } | null {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      return null;
    }
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) {
      return null;
    }
    const key = trimmed.substring(0, eqIndex).trim();
    const value = trimmed.substring(eqIndex + 1).trim();
    if (key === "") {
      return null;
    }
    return { key, value };
  }
}
