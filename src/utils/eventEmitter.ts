import { EventEmitter } from "events";

class ReportEmitter extends EventEmitter {}
export const reportEmitter = new ReportEmitter();