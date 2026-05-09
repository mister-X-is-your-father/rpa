import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

export const config = {
  chrome: {
    executablePath: process.env.CHROME_PATH || "/mnt/c/Program Files/Google/Chrome/Application/chrome.exe",
    userDataDir: process.env.CHROME_USER_DATA || "C:\\Users\\ikimo\\AppData\\Local\\Google\\Chrome\\User Data",
    profile: process.env.CHROME_PROFILE || "Default",
  },
  gemini: {
    url: process.env.GEMINI_URL || "https://gemini.google.com/app",
  },
  output: {
    dir: path.resolve(__dirname, "..", process.env.OUTPUT_DIR || "./output"),
    screenshotDir: path.resolve(__dirname, "..", process.env.SCREENSHOT_DIR || "./screenshots"),
  },
  retry: {
    maxRetries: Number(process.env.MAX_RETRIES) || 3,
    maxHistoryRetries: Number(process.env.MAX_HISTORY_RETRIES) || 2,
  },
};
