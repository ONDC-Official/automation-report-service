import * as yaml from "js-yaml";
import * as fs from "fs";
import * as path from "path";
import { logger } from "./logger";

// Load ReportingConfig.yaml
export const loadConfig = (domain: string, version: string) => {
  try {
    const configPath = path.join(__dirname, "../config/ReportingConfig.yaml");
    const file = fs.readFileSync(configPath, "utf8");
    const yamlFile: any = yaml.load(file);

    const domainConfig = yamlFile?.domains?.[domain]?.versions?.[version];
    if (!domainConfig) {
      logger.error(
        `Configuration for domain '${domain}' and version '${version}' not found.`
      );
      return;
    }

    return domainConfig;
  } catch (error) {
    logger.error("Error loading flowConfig.yaml:", error);
    return null;
  }
};
