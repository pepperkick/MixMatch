const mongoose = require('mongoose');

module.exports = {
    name: "Server",
    plugins: {
        timestamps: true,
        events: true,
    },
    schema: {
        name: String,
        ip: String,
        port: String,
        rcon: String,
        channel: String,
        format: String,
        role: String,
        players: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: "Player"
        }]
    },
    options: {
        versionKey: false
    }
}
