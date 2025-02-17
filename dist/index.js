"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const reportRoute_1 = __importDefault(require("./routes/reportRoute"));
const ondc_automation_cache_lib_1 = require("ondc-automation-cache-lib");
const logger_1 = require("./utils/logger");
const dotenv_1 = __importDefault(require("dotenv")); // Import dotenv to load environment variables
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
dotenv_1.default.config(); // Load environment variables from the .env file
try {
    ondc_automation_cache_lib_1.RedisService.useDb(2);
}
catch (err) {
    logger_1.logger.error(err);
}
app.use(express_1.default.json());
app.use("/generate-report", reportRoute_1.default);
app.use((err, req, res, next) => {
    logger_1.logger.error(err.stack);
    res.status(500).send("Something went wrong!");
});
app.listen(PORT, () => {
    logger_1.logger.info(`Server is running on http://localhost:${PORT}`);
});
