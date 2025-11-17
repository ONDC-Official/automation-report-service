export function getRuntimeExtension() {
    // When running from dist, compiled to JS
    if (__filename.endsWith(".js")) return "js";
  console.log("__filename=>>>>>>",__filename)
    // When running through ts-node in local
    return "ts";
  }
  