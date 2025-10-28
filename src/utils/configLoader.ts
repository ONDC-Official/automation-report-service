import * as yaml from "js-yaml";
import * as fs from "fs";
import * as path from "path";
import logger from "@ondc/automation-logger";

// Load ReportingConfig.yaml
export const loadConfig = (domain: string, version: string) => {
  logger.info("Entering loadConfig function. Loading ReportingConfig.yaml...",
    {meta: { domain, version }},
  );
  try {
    const configPath = path.join(__dirname, "../config/ReportingConfig.yaml");
    const file = fs.readFileSync(configPath, "utf8");
    const yamlFile: any = yaml.load(file);

    const domainConfig = yamlFile?.domains?.[domain]?.versions?.[version];
    if (!domainConfig) {
      logger.error(`Configuration for domain '${domain}' and version '${version}' not found.`, { domain, version });
      return;
    }
    logger.info("Exiting loadConfig function. Loaded ReportingConfig.yaml.", { domain, version, domainConfig });
    return domainConfig;
  } catch (error) {
    logger.error("Error loading ReportingConfig.yaml", error, { domain, version });
    return null;
  }
};
