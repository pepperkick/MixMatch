const mongoose = require('mongoose');

module.exports = {
    name: "Player",
    plugins: {
        "@abskmj/mongoose-plugin-timestamps": true,
        events: true,
        "discord.user": true
    },
    schema: {
        steam: String,
        discord: String,
        queue: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Queue',
            default: null
        },
        server: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Server',
            default: null
        }
    },
    options: {
        versionKey: false
    }
}
