const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    canvas_url: {
        type: String,
        required: true,
    },
    ntfy_topic: {
        type: String,
        required: true,
    },
    created_at: {
        type: Date,
        default: Date.now,
    },
});

module.exports = mongoose.model("User", userSchema);