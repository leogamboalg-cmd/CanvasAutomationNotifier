require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const ical = require("ical");
const bcrypt = require("bcrypt");

const app = express();
const CRON_SECRET = process.env.CRON_SECRET;
const PORT = process.env.PORT || 3000;
const PI_ENDPOINT = process.env.PI_ENDPOINT;
const PI_API_KEY = process.env.PI_API_KEY;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN;
const PASSCODE_PEPPER = process.env.PASSCODE_PEPPER;
const mongoose = require("mongoose");
const User = require("./models/User");

if (!PI_ENDPOINT || !PI_API_KEY || !FRONTEND_ORIGIN || !PASSCODE_PEPPER) {
  throw new Error(
    "Missing PI_ENDPOINT, PI_API_KEY, FRONTEND_ORIGIN, or PASSCODE_PEPPER in .env",
  );
}

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error(err));

// If deployed behind Render / Railway / Nginx / Cloudflare / etc.
// set this appropriately so req.ip works for rate limiting.
app.set("trust proxy", 1);

app.use(helmet());

const allowedOrigins = [
  FRONTEND_ORIGIN,
  "http://localhost:5500",
  "http://127.0.0.1:5500",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  }),
);

app.use(express.json({ limit: "10kb" }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100, // 100 requests per IP per window across the API
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
});

const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 5, // 5 requests per IP per window
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many submissions. Please try again later." },
});

app.use("/api", apiLimiter);

function isValidCanvasUrl(value) {
  if (typeof value !== "string") return false;
  const url = value.trim();

  if (url.length < 20 || url.length > 2000) return false;

  try {
    const parsed = new URL(url);

    if (parsed.protocol !== "https:") return false;
    if (!isAllowedCanvasHost(parsed.hostname)) return false;

    const looksLikeIcs =
      parsed.pathname.toLowerCase().endsWith(".ics") ||
      parsed.href.toLowerCase().includes(".ics");

    return looksLikeIcs;
  } catch {
    return false;
  }
}

function isAllowedCanvasHost(hostname) {
  if (typeof hostname !== "string") return false;

  const normalized = hostname.trim().toLowerCase();

  return (
    normalized === "canvas.instructure.com" ||
    normalized.endsWith(".instructure.com") ||
    normalized.startsWith("canvas.") ||
    normalized.includes(".canvas.")
  );
}

function isValidNtfyTopic(value) {
  if (typeof value !== "string") return false;
  const topic = value.trim();

  if (topic.length < 3 || topic.length > 64) return false;

  // Letters, numbers, hyphen, underscore only
  return /^[A-Za-z0-9_-]+$/.test(topic);
}

function isValidPassCode(value) {
  if (typeof value !== "string") return false;

  const passCode = value.trim();

  if (passCode.length < 6 || passCode.length > 64) return false;

  // At least 1 letter + 1 number
  const hasLetter = /[A-Za-z]/.test(passCode);
  const hasNumber = /[0-9]/.test(passCode);

  if (!hasLetter || !hasNumber) return false;

  return true;
}

function getSuccessMessage(message) {
  if (typeof message !== "string") {
    return "Settings submitted successfully.";
  }

  const normalizedMessage = message.trim();

  if (!normalizedMessage || normalizedMessage.toLowerCase() === "ok") {
    return "Settings submitted successfully.";
  }

  return normalizedMessage;
}

const BCRYPT_ROUNDS = 12;

function applyPasscodePepper(passCode) {
  return `${String(passCode)}${PASSCODE_PEPPER}`;
}

app.post("/api/submit", submitLimiter, async (req, res) => {
  try {
    const canvasUrl = String(req.body.canvas_url || "").trim();
    const ntfyTopic = String(req.body.ntfy_topic || "").trim();
    const passCode = String(req.body.pass_code || "").trim();

    if (
      !isValidCanvasUrl(canvasUrl) ||
      !isValidNtfyTopic(ntfyTopic) ||
      !isValidPassCode(passCode)
    ) {
      return res.status(400).json({
        error: "Invalid Canvas URL or ntfy topic or passcode",
      });
    }

    const existingUser = await User.findOne({
      canvas_url: canvasUrl,
      ntfy_topic: ntfyTopic,
    });

    if (existingUser) {
      return res.status(400).json({
        error: "User already exists",
      });
    }

    const hashedPassCode = await bcrypt.hash(
      applyPasscodePepper(passCode),
      BCRYPT_ROUNDS,
    );

    await User.create({
      canvas_url: canvasUrl,
      ntfy_topic: ntfyTopic,
      pass_code: hashedPassCode,
    });

    return res.json({
      message: "User saved successfully",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save user" });
  }
});

app.post("/api/delete", async (req, res) => {
  try {
    const ntfyTopic = String(req.body.ntfy_topic || "").trim();
    const passCode = String(req.body.pass_code || "").trim();

    if (!ntfyTopic || !passCode) {
      return res.status(400).json({
        error: "Missing topic or passcode",
      });
    }

    const user = await User.findOne({ ntfyTopic: ntfyTopic });

    if (!user) {
      return res.status(404).json({
        error: "User not found",
      });
    }

    const isMatch = await bcyrpt.compare(
      applyPasscodePepper(passCode),
      user.pass_code,
    );

    if (!isMatch) {
      return res.status(401).json({
        error: "Invalid passcode",
      });
    }

    await User.deleteOne({ _id: user._id });
    return res.json({
      message: "User deleted successfully",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

app.post("/api/notify-all", async (req, res) => {
  try {
    const provided = req.headers["x-cron-secret"];

    if (provided !== CRON_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const users = await User.find();

    console.log(`Running notifyAll for ${users.length} users`);

    for (const user of users) {
      try {
        const response = await fetch(user.canvas_url);
        const text = await response.text();

        const events = ical.parseICS(text);
        const now = new Date();

        let upcomingMessage = "";
        let importantMessage = "";

        for (const key in events) {
          const event = events[key];

          if (event.type !== "VEVENT") continue;
          if (!event.end) continue;

          const due = new Date(event.end);

          if (due <= now) continue;

          const block =
            `${event.summary || "Untitled event"}\n` +
            `Due: ${due.toLocaleString()}\n` +
            "------------------------------\n";

          if (due.toDateString() === now.toDateString()) {
            importantMessage += block;
          } else {
            upcomingMessage += block;
          }
        }

        if (upcomingMessage) {
          await fetch(`https://ntfy.sh/${user.ntfy_topic}`, {
            method: "POST",
            body: upcomingMessage,
          });

          console.log(`Sent upcoming to ${user.ntfy_topic}`);
        }

        if (importantMessage) {
          const prefix =
            "IMPORTANT DUE TODAY | IMPORTANT DUE TODAY | IMPORTANT DUE TODAY\n";

          await fetch(`https://ntfy.sh/${user.ntfy_topic}`, {
            method: "POST",
            body: prefix + importantMessage,
          });

          console.log(`Sent IMPORTANT to ${user.ntfy_topic}`);
        }
      } catch (err) {
        console.error(`User failed: ${user.ntfy_topic}`, err.message);
      }
    }

    res.json({ message: "notifyAll executed" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to run notifyAll" });
  }
});

app.get("/", (req, res) => {
  res.send("Backend is running");
});

app.get("/api/status", (req, res) => {
  res.json({ status: "ok" });
});

app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
