const mongoose = require('mongoose');

module.exports = {
    name: "Player",
    plugins: {
        timestamps: true,
        events: true,
    },
    schema: {
        steam: String,
        discord: String,
        queue: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Queue',
            default: null
        }
    },
    options: {
        versionKey: false
    }
}
