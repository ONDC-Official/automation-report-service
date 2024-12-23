import * as yaml from "js-yaml";
import * as fs from "fs";
import * as path from "path";

let cachedConfig: any = null;

// Load and cache the YAML config file
export const loadConfig = () => {
  if (!cachedConfig) {
    try {
      const configPath = path.join(__dirname, "../config/validationConfig.yaml");
      const fileContent = fs.readFileSync(configPath, "utf8");
      cachedConfig = yaml.load(fileContent);
      console.log("Configuration loaded successfully.");
    } catch (error) {
      console.error("Error loading configuration:", error);
      throw error;
    }
  }
  return cachedConfig;
};