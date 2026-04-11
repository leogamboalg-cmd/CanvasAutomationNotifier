require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const app = express();

const PORT = process.env.PORT || 3000;
const PI_ENDPOINT = process.env.PI_ENDPOINT;
const PI_API_KEY = process.env.PI_API_KEY;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN;

if (!PI_ENDPOINT || !PI_API_KEY || !FRONTEND_ORIGIN) {
    throw new Error("Missing PI_ENDPOINT, PI_API_KEY, or FRONTEND_ORIGIN in .env");
}

// If deployed behind Render / Railway / Nginx / Cloudflare / etc.
// set this appropriately so req.ip works for rate limiting.
app.set("trust proxy", 1);

app.use(helmet());

const allowedOrigins = [
    FRONTEND_ORIGIN,
    "http://localhost:5500",
    "http://127.0.0.1:5500"
];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
}));

app.use(express.json({ limit: "10kb" }));

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 100,               // 100 requests per IP per window across the API
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many requests. Please try again later." },
});

const submitLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 5,                 // 5 requests per IP per window
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

app.post("/api/submit", submitLimiter, async (req, res) => {
    try {
        const canvasUrl = String(req.body.canvas_url || "").trim();
        const ntfyTopic = String(req.body.ntfy_topic || "").trim();

        if (!isValidCanvasUrl(canvasUrl) || !isValidNtfyTopic(ntfyTopic)) {
            return res.status(400).json({
                error: "Invalid Canvas URL or ntfy topic",
            });
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        let response;
        try {
            response = await fetch(PI_ENDPOINT, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-API-Key": PI_API_KEY,
                },
                body: JSON.stringify({
                    canvas_url: canvasUrl,
                    ntfy_topic: ntfyTopic,
                }),
                signal: controller.signal,
            });
        } finally {
            clearTimeout(timeout);
        }

        let data = null;
        try {
            data = await response.json();
        } catch {
            data = null;
        }

        if (!response.ok) {
            return res.status(response.status).json({
                error: data?.error || "Submission failed",
            });
        }

        return res.json({
            message: getSuccessMessage(data?.message),
        });
    } catch (err) {
        const isAbort = err.name === "AbortError";

        console.error("Backend error:", isAbort ? "Pi request timed out" : err.message);

        return res.status(isAbort ? 504 : 500).json({
            error: isAbort ? "Upstream timeout" : "Server error",
        });
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
