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
